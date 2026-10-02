import { useEffect, useMemo, useRef } from "react";
import type { Chapter, Chunk } from "../api/client";
import type { Position } from "../agent/useReadingAgent";

interface Props {
  chunks: Map<number, Chunk>;
  chunkVersion: number;
  chapters: Chapter[];
  position: Position;
  wordIndex: number | null;
  onSeek: (p: Position) => void;
}

type Para = { key: string; sentences: { idx: number; text: string }[] };

function paragraphs(chunk: Chunk): Para[] {
  const out: Para[] = [];
  let current: Para = { key: `${chunk.index}-0`, sentences: [] };
  chunk.sentences.forEach(([start, end], i) => {
    const gap = i === 0 ? "" : chunk.text.slice(chunk.sentences[i - 1][1], start);
    if (gap.includes("\n") && current.sentences.length) {
      out.push(current);
      current = { key: `${chunk.index}-${i}`, sentences: [] };
    }
    current.sentences.push({ idx: i, text: chunk.text.slice(start, end) });
  });
  if (current.sentences.length) out.push(current);
  return out;
}

function withWord(text: string, wordIndex: number | null) {
  if (wordIndex === null || wordIndex >= text.length) return text;
  const rest = text.slice(wordIndex);
  const len = rest.search(/\s|$/);
  return (<>{text.slice(0, wordIndex)}<span className="word-current">{rest.slice(0, len)}</span>{rest.slice(len)}</>);
}

/** The passage being read: previous chunk (dimmed), current chunk with the live sentence, next chunk. */
export function ReaderText({ chunks, chunkVersion, chapters, position, wordIndex, onSeek }: Props) {
  const currentRef = useRef<HTMLSpanElement>(null);
  const visible = useMemo(
    () => [position.chunk - 1, position.chunk, position.chunk + 1].map((i) => chunks.get(i)).filter(Boolean) as Chunk[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunks, chunkVersion, position.chunk],
  );

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [position.chunk, position.sentence, chunkVersion]);

  if (!visible.length) {
    return <div className="py-24 text-center text-sm text-ink-3">Loading passage…</div>;
  }

  return (
    <article className="reading-body mx-auto">
      {visible.map((chunk) => {
        const chapter = chapters.find((c) => c.start_chunk === chunk.index);
        const isCurrent = chunk.index === position.chunk;
        const isPast = chunk.index < position.chunk;
        return (
          <section key={chunk.index} className={`transition-opacity duration-500 ${isCurrent ? "" : "opacity-55"}`}>
            {chapter && (
              <header className="mt-6 mb-8 text-center">
                <div className="text-xs font-semibold tracking-[0.25em] text-ink-3 uppercase font-sans">Section {chapter.index + 1}</div>
                <h2 className="mt-2 text-[1.5em] leading-tight font-semibold [text-wrap:balance]">{chapter.title}</h2>
                <div className="mx-auto mt-5 h-px w-16 bg-line" />
              </header>
            )}
            {paragraphs(chunk).map((para) => (
              <p key={para.key} className="mb-[1.1em] [text-wrap:pretty]">
                {para.sentences.map(({ idx, text }) => {
                  const here = isCurrent && idx === position.sentence;
                  const read = isPast || (isCurrent && idx < position.sentence);
                  return (
                    <span key={idx}>
                      <span
                        ref={here ? currentRef : undefined}
                        className={`sentence ${here ? "current" : ""} ${read ? "read" : ""}`}
                        onClick={() => onSeek({ chunk: chunk.index, sentence: idx })}
                        title="Read from here"
                      >
                        {here ? withWord(text, wordIndex) : text}
                      </span>{" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </section>
        );
      })}
    </article>
  );
}
