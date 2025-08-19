"use client";
import React from "react";

type Props = { text: string };

// Minimal, dependency-free Markdown renderer focusing on bold, italics and inline code.
// Supported:
// - **bold**
// - *italic* or _italic_
// - `inline code`
// - preserves line breaks and paragraphs
// - fenced code blocks ``` ... ```
export default function MarkdownLite({ text }: Props) {
  if (!text) return null;

  const blocks = splitFencedCodeBlocks(text);

  return (
    <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
      {blocks.map((b, i) => b.type === "code" ? (
        <pre key={i} className="my-2 rounded bg-black/40 border border-white/10 p-2 overflow-x-auto text-xs">
          <code>{b.content}</code>
        </pre>
      ) : (
        <span key={i}>{renderInline(b.content)}</span>
      ))}
    </div>
  );
}

function splitFencedCodeBlocks(input: string): Array<{ type: "text" | "code"; content: string }> {
  const parts: Array<{ type: "text" | "code"; content: string }> = [];
  const regex = /```[\w-]*\n([\s\S]*?)\n```/g; // ```lang?\n...\n```
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", content: input.slice(lastIndex, m.index) });
    }
    parts.push({ type: "code", content: m[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < input.length) {
    parts.push({ type: "text", content: input.slice(lastIndex) });
  }
  return parts;
}

function renderInline(input: string): React.ReactNode[] {
  // First split by inline code `...`
  const segments = input.split(/(`[^`]+`)/g);
  const out: React.ReactNode[] = [];
  segments.forEach((seg, idx) => {
    if (/^`[^`]+`$/.test(seg)) {
      const content = seg.slice(1, -1);
      out.push(
        <code key={idx} className="rounded bg-black/40 px-1 py-0.5 border border-white/10 text-[0.85em]">
          {content}
        </code>
      );
    } else {
      // Bold then italics on the remaining text. Keep it simple and safe.
      // Replace **bold**
      const withBold = splitAndWrap(seg, /\*\*([^*]+)\*\*/g, (m, i) => (
        <strong key={`b-${idx}-${i}`} className="font-semibold text-zinc-100">{m}</strong>
      ));
      // For each piece, also apply _italic_ or *italic*
      const withItalics: React.ReactNode[] = [];
      withBold.forEach((piece, i) => {
        if (typeof piece !== "string") { withItalics.push(piece); return; }
        const italics = splitAndWrap(piece, /(?:\*([^*]+)\*|_([^_]+)_)/g, (m2, ii) => (
          <em key={`i-${idx}-${i}-${ii}`} className="italic text-zinc-100/90">{m2}</em>
        ));
        // After italics, highlight standalone word FREE in emerald
        italics.forEach((part, j) => {
          if (typeof part !== 'string') { withItalics.push(part); return; }
          const chunks = part.split(/(\bFREE\b)/gi);
          chunks.forEach((ch, k) => {
            if (/^\bFREE\b$/i.test(ch)) {
              withItalics.push(<span key={`free-${idx}-${i}-${j}-${k}`} className="text-emerald-300 font-semibold">FREE</span>);
            } else if (ch) {
              withItalics.push(<React.Fragment key={`t-${idx}-${i}-${j}-${k}`}>{ch}</React.Fragment>);
            }
          });
        });
      });
      out.push(<React.Fragment key={`t-${idx}`}>{withItalics}</React.Fragment>);
    }
  });
  return out;
}

function splitAndWrap(
  input: string,
  regex: RegExp,
  wrap: (matchText: string, idx: number) => React.ReactNode
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((m = re.exec(input)) !== null) {
    if (m.index > lastIndex) result.push(input.slice(lastIndex, m.index));
    const captured = m[1] || m[2] || "";
    result.push(wrap(captured, i++));
    lastIndex = re.lastIndex;
  }
  if (lastIndex < input.length) result.push(input.slice(lastIndex));
  return result;
}
