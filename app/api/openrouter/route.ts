import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, apiKey: apiKeyFromBody, referer, title } = await req.json();
    const apiKey = apiKeyFromBody || process.env.OPENROUTER_API_KEY;
    const usedKeyType = apiKeyFromBody ? 'user' : (process.env.OPENROUTER_API_KEY ? 'shared' : 'none');
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing OpenRouter API key' }), { status: 400 });
    if (!model) return new Response(JSON.stringify({ error: 'Missing model id' }), { status: 400 });

    type InMsg = { role?: unknown; content?: unknown };
    type OutMsg = { role: 'user' | 'assistant' | 'system'; content: string };

    const isRole = (r: unknown): r is OutMsg['role'] => r === 'user' || r === 'assistant' || r === 'system';
    const sanitize = (msgs: unknown[]): OutMsg[] =>
      (Array.isArray(msgs) ? (msgs as InMsg[]) : [])
        .map((m) => {
          const role = isRole(m?.role) ? m.role : 'user';
          const content = typeof m?.content === 'string' ? m.content : String(m?.content ?? '');
          return { role, content };
        })
        .filter((m) => isRole(m.role));
    // Keep last 8 messages to avoid overly long histories for picky providers
    const trimmed = (arr: OutMsg[]) => (arr.length > 8 ? arr.slice(-8) : arr);
    const makeBody = (msgs: unknown) => ({ model, messages: trimmed(sanitize((msgs as unknown[]) || [])) });
    const requestInit = (bodyObj: unknown): RequestInit => ({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': referer || 'http://localhost',
        'X-Title': title || 'Open Source Fiesta',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    });

    // First attempt
    let resp = await fetch('https://openrouter.ai/api/v1/chat/completions', requestInit(makeBody(messages)));

    let data: unknown = await resp.json();
    if (!resp.ok) {
      const errStr = (() => {
        const d = data as { error?: { message?: unknown } } | Record<string, unknown> | string | null | undefined;
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          const maybeErr = (d as { error?: { message?: unknown } }).error;
          if (maybeErr && typeof maybeErr === 'object' && 'message' in maybeErr) {
            const m = (maybeErr as { message?: unknown }).message;
            return typeof m === 'string' ? m : JSON.stringify(m);
          }
          try { return JSON.stringify(d); } catch { return 'Unknown error'; }
        }
        return 'Unknown error';
      })();
      if (resp.status === 429) {
        // Convert to a friendly guidance text while preserving raw error
        const text = usedKeyType === 'user'
          ? 'Your OpenRouter API key hit a rate limit. Please retry after a moment or upgrade your plan/limits.'
          : 'This model hit a shared rate limit. Add your own OpenRouter API key for FREE in Settings for higher limits and reliability.';
        return Response.json({ text, error: errStr, code: 429, provider: 'openrouter', usedKeyType });
      }
      if (resp.status === 404 && /model not found/i.test(errStr)) {
        const text = 'This model is currently unavailable on OpenRouter (404 model not found). It may be renamed, private, or the free pool is paused. Try again later or pick another model.';
        return Response.json({ text, code: 404, provider: 'openrouter', usedKeyType }, { status: 404 });
      }
      // Special-case retry for Sarvam: try with only the last user message
      if (typeof model === 'string' && /sarvam/i.test(model)) {
        const lastUser = Array.isArray(messages)
          ? [...messages].reverse().find((m) => (m as InMsg)?.role === 'user' && ((m as InMsg)?.content !== undefined))
          : null;
        if (lastUser) {
          const cont = (lastUser as InMsg).content;
          const contentVal: string = typeof cont === 'string' ? cont : String(cont);
          const simpleMsgs: OutMsg[] = [{ role: 'user', content: contentVal }];
          resp = await fetch('https://openrouter.ai/api/v1/chat/completions', requestInit(makeBody(simpleMsgs)));
          data = await resp.json();
          if (resp.ok) {
            // continue to normalization below using new data
          } else {
            const friendly2 = `Provider returned error for ${model} (after retry) [status ${resp.status}]`;
            return Response.json({ text: friendly2, code: resp.status, provider: 'openrouter', usedKeyType }, { status: resp.status });
          }
        } else {
          const friendly = `Provider returned error for ${model} [status ${resp.status}]`;
          return Response.json({ text: friendly, code: resp.status, provider: 'openrouter', usedKeyType }, { status: resp.status });
        }
      } else {
        // Return structured JSON but also a user-friendly text to render in UI
        const friendly = `Provider returned error${model ? ` for ${model}` : ''} [status ${resp.status}]`;
        return Response.json({ text: friendly, code: resp.status, provider: 'openrouter', usedKeyType }, { status: resp.status });
      }
    }

    // Normalize content to a plain string
    const choice = (data as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0] || {};
    const msg = (choice as { message?: { content?: unknown } } | null)?.message || {};
    const content: unknown = (msg as { content?: unknown } | null)?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      // Array of content blocks (e.g., {type:'text', text:'...'}, {type:'reasoning', ...})
      text = content
        .map((c) => {
          if (!c) return '';
          if (typeof c === 'string') return c;
          const obj = c as { text?: unknown; content?: unknown; value?: unknown };
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
          if (typeof obj.value === 'string') return obj.value;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    } else if (content && typeof content === 'object') {
      // Some providers nest text inside content.text
      if (typeof (content as { text?: unknown }).text === 'string') {
        text = String((content as { text?: unknown }).text);
      } else {
        try { text = JSON.stringify(content); } catch { text = ''; }
      }
    }

    // DeepSeek-style reasoning tags often include <think> ... </think>
    const stripReasoning = (s: string) =>
      s
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\|?thought_(start|end)\|>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .trim();

    // Convert common Markdown to plain text (headers, lists, emphasis, links, code fences)
    const mdToPlain = (s: string) =>
      s
        // code fences and inline code
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
        .replace(/`([^`]+)`/g, '$1')
        // headings ###, ##, #
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        // list markers -, *, +, numbers
        .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
        .replace(/^\s{0,3}\d+\.\s+/gm, (m) => m.replace(/\d+\./, (n) => `${n.replace('.', '')}. `))
        // bold/italic
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // links [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        // blockquotes
        .replace(/^>\s?/gm, '')
        // horizontal rules
        .replace(/^\s{0,3}([-*_])\s?\1\s?\1.*$/gm, '')
        // excess whitespace
        .replace(/\s+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!text) {
      // Additional fallbacks seen across some providers
      const alt = (choice as { content?: unknown }).content || (msg as { response_text?: unknown }).response_text || (msg as { result?: unknown }).result || (data as Record<string, unknown> | null | undefined)?.['output_text'];
      if (typeof alt === 'string') text = alt;
      else if (Array.isArray(alt)) {
        text = alt.map((c) => {
          if (typeof c === 'string') return c;
          const obj = c as { text?: unknown; content?: unknown };
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
          return '';
        }).filter(Boolean).join('\n');
      }
    }

    if (text) {
      const stripped = stripReasoning(text);
      text = stripped || text; // avoid stripping to empty
      // For DeepSeek R1, return plain text (no Markdown) to improve readability
      if (typeof model === 'string' && /deepseek\s*\/\s*deepseek-r1/i.test(model)) {
        text = mdToPlain(text);
      }
    }

    if (!text) {
      text = 'No response from provider.';
    }

    return Response.json({ text, raw: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

