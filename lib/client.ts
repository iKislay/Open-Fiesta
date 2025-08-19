import { ChatMessage } from './types';

export async function callGemini(args: { apiKey?: string; model: string; messages: ChatMessage[]; imageDataUrl?: string }) {
  const endpoint = args.model === 'gemini-2.5-pro' ? '/api/gemini-pro' : '/api/gemini';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return res.json();
}

export async function callOpenRouter(args: { apiKey?: string; model: string; messages: ChatMessage[] }) {
  const res = await fetch('/api/openrouter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, referer: typeof window !== 'undefined' ? window.location.origin : undefined, title: 'AI Fiesta' }),
  });
  return res.json();
}
