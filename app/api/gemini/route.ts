import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, apiKey: apiKeyFromBody, imageDataUrl } = await req.json();
    const apiKey = apiKeyFromBody || process.env.GEMINI_API_KEY;
    const usedKeyType = apiKeyFromBody ? 'user' : (process.env.GEMINI_API_KEY ? 'shared' : 'none');
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing Gemini API key' }), { status: 400 });
    const allowed = new Set(['gemini-2.5-flash', 'gemini-2.5-pro']);
    const requested = typeof model === 'string' ? model : 'gemini-2.5-flash';
    const geminiModel = allowed.has(requested) ? requested : 'gemini-2.5-flash';

    // Convert OpenAI-style messages to Gemini contents
    // Gemini expects: { contents: [{ role, parts: [{ text }] }, ...] }
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

    // If an image data URL is provided, attach it as inline_data to the last user message
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
      const errObj = errStr;
      if (resp.status === 429) {
        const text = usedKeyType === 'user'
          ? 'Your Gemini API key hit a rate limit. Please retry after a moment or upgrade your plan/limits.'
          : 'This model hit a shared rate limit. Add your own Gemini API key for FREE in Settings for higher limits and reliability.';
        return Response.json({ text, error: errObj, code: 429, provider: 'gemini', usedKeyType });
      }
      return new Response(JSON.stringify({ error: errObj, raw: data }), { status: resp.status });
    }

    // Extract text
    const extractText = (d: unknown): string => {
      const candidates = (d as { candidates?: unknown[] } | null)?.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) return '';
      const cand = candidates[0] as { content?: { parts?: unknown[] } } | undefined;
      const parts = cand?.content?.parts;
      if (!Array.isArray(parts)) return '';
      const texts = parts
        .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? String((p as { text?: unknown }).text) : ''))
        .filter(Boolean);
      return texts.join('\n');
    };
    const text = extractText(data) ?? '';
    return Response.json({ text, raw: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

