import { NextRequest } from 'next/server';

// Dedicated endpoint for Gemini 2.5 Pro
export async function POST(req: NextRequest) {
  try {
    const { messages, apiKey: apiKeyFromBody, imageDataUrl } = await req.json();
    const apiKey = apiKeyFromBody || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing Gemini API key' }), { status: 400 });
    const geminiModel = 'gemini-2.5-pro';

    // Convert OpenAI-style messages to Gemini contents
    type InMsg = { role?: unknown; content?: unknown };
    type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
    type GeminiContent = { role: 'user' | 'model' | 'system'; parts: GeminiPart[] };

    const toRole = (r: unknown): 'user' | 'model' | 'system' => {
      const role = typeof r === 'string' ? r : '';
      if (role === 'assistant') return 'model';
      if (role === 'user' || role === 'system') return role;
      return 'user';
    };

    const contents: GeminiContent[] = (Array.isArray(messages) ? (messages as InMsg[]) : []).map((m) => ({
      role: toRole(m.role),
      parts: [{ text: typeof m?.content === 'string' ? m.content : String(m?.content ?? '') }],
    }));

    // Attach image to last user message if provided
    if (imageDataUrl && contents.length > 0) {
      for (let i = contents.length - 1; i >= 0; i--) {
        if (contents[i].role === 'user') {
          try {
            const [meta, base64] = String(imageDataUrl).split(',');
            const mt = /data:(.*?);base64/.exec(meta || '')?.[1] || 'image/png';
            contents[i].parts.push({ inline_data: { mime_type: mt, data: base64 } });
          } catch {}
          break;
        }
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          response_mime_type: 'text/plain',
        },
      }),
    });

    const data: unknown = await resp.json();
    if (!resp.ok) {
      const errStr = (() => {
        const d = data as { error?: { message?: unknown } } | Record<string, unknown> | string | null | undefined;
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') {
          if ('error' in d && d.error && typeof (d as { error?: unknown }).error === 'object') {
            const maybe = (d as { error?: { message?: unknown } }).error;
            const m = maybe && typeof maybe === 'object' && 'message' in maybe ? (maybe as { message?: unknown }).message : undefined;
            return typeof m === 'string' ? m : JSON.stringify(m);
          }
          try { return JSON.stringify(d); } catch { return 'Unknown error'; }
        }
        return 'Unknown error';
      })();
      if (resp.status === 429) {
        const text = 'This model hit a shared rate limit. Add your own Gemini API key for FREE in Settings for higher limits and reliability.';
        return Response.json({ text, error: errStr, code: 429, provider: 'gemini' });
      }
      return new Response(JSON.stringify({ error: errStr, raw: data }), { status: resp.status });
    }

    // Normalize response to plain text
    const cand = (data as { candidates?: unknown[] } | null)?.candidates?.[0] as
      | { content?: { parts?: unknown[] }; finishReason?: unknown; safetyRatings?: unknown[] }
      | undefined;
    const parts = (cand?.content as { parts?: unknown[] } | undefined)?.parts ?? [];
    let text = '';
    if (Array.isArray(parts)) {
      const collected = parts
        .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? String((p as { text?: unknown }).text) : ''))
        .filter(Boolean);
      text = collected.join('\n');
    }
    if (!text && Array.isArray(parts) && parts.length) {
      // If no simple text, try to stringify meaningful structure
      text = parts
        .map((p) => {
          const pp = p as { text?: unknown; inline_data?: unknown };
          if (typeof pp?.text === 'string') return String(pp.text);
          if (pp?.inline_data) return '[inline data]';
          const s = (() => { try { return JSON.stringify(p); } catch { return ''; } })();
          return typeof s === 'string' ? s : '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (!text) {
      const finish = (cand as { finishReason?: unknown } | undefined)?.finishReason || (data as { finishReason?: unknown } | undefined)?.finishReason;
      const blockReason = (data as { promptFeedback?: { blockReason?: unknown } } | undefined)?.promptFeedback?.blockReason ||
        (Array.isArray((cand as { safetyRatings?: Array<{ category?: unknown }> } | undefined)?.safetyRatings)
          ? (cand as { safetyRatings?: Array<{ category?: unknown }> }).safetyRatings?.[0]?.category
          : undefined);
      const blocked = finish && String(finish).toLowerCase().includes('safety');
      if (blocked || blockReason) {
        text = `Gemini Pro blocked the content due to safety settings${blockReason ? ` (reason: ${blockReason})` : ''}. Try rephrasing your prompt.`;
      }
    }
    if (!text) {
      // Final fallback: compact stringify of candidate to avoid empty response
      const compact = (() => {
        try { return JSON.stringify(cand); } catch { return ''; }
      })();
      const hint = 'Gemini Pro returned an empty message. This can happen on shared quota. Try again, rephrase, or add your own Gemini API key in Settings.';
      text = compact || hint;
    }
    return Response.json({ text, raw: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

