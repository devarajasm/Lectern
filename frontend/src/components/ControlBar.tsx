import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { BookDetail, ReadingStatus } from "../api/client";
import type { Position } from "../agent/useReadingAgent";
import { AgentOrb, statusHint, statusLabel } from "./AgentOrb";

interface Props {
  book: BookDetail;
  status: ReadingStatus;
  position: Position;
  page: number | null;
  level: number;
  thinking: boolean;
  rate: number;
  engineLabel: string;
  onRate: (r: number) => void;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onInterrupt: () => void;
  onSeekChunk: (chunk: number) => void;
}

const RATES = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

export function ControlBar(p: Props) {
  const playing = p.status === "READING" || p.status === "LISTENING" || p.status === "ANSWERING" || p.status === "RESUMING";
  const chapter = [...p.book.chapters].reverse().find((c) => c.start_chunk <= p.position.chunk);
  const pct = p.book.chunk_count > 1 ? (p.position.chunk / (p.book.chunk_count - 1)) * 100 : 0;

  return (
    <div className="border-t border-line bg-card/85 backdrop-blur-xl">
      <div className="group relative h-1.5 cursor-pointer bg-paper-2"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          p.onSeekChunk(Math.round(((e.clientX - r.left) / r.width) * (p.book.chunk_count - 1)));
        }}
        title="Jump to position">
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: `${pct}%` }} />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] py-3 sm:px-6">
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-sm font-medium">{chapter?.title ?? p.book.title}</div>
          <div className="truncate text-xs text-ink-3">
            {p.page ? `Page ${p.page} of ${p.book.page_count}` : `${p.book.page_count} pages`} · {Math.round(pct)}%
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-4">
          <button onClick={() => p.onStep(-1)} className="rounded-full p-2.5 text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Previous sentence" title="Previous sentence (←)">
            <SkipBack className="size-5" />
          </button>
          <button onClick={p.onToggle} className="grid size-12 place-items-center rounded-full bg-ink text-paper shadow-md transition-transform hover:scale-105 active:scale-95"
            aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause (K)" : "Play (K)"}>
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
          </button>
          <button onClick={() => p.onStep(1)} className="rounded-full p-2.5 text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Next sentence" title="Next sentence (→)">
            <SkipForward className="size-5" />
          </button>
          <div className="ml-1 flex items-center gap-3 sm:ml-3">
            <AgentOrb status={p.status} level={p.level} thinking={p.thinking} onPress={p.onInterrupt} size={60} />
            <div className="hidden w-44 md:block">
              <div className="text-sm font-semibold">{statusLabel(p.status, p.thinking)}</div>
              <div className="text-xs leading-snug text-ink-3">{statusHint(p.status, p.thinking)}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="hidden rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-3 lg:inline">{p.engineLabel}</span>
          <select value={p.rate} onChange={(e) => p.onRate(Number(e.target.value))}
            className="rounded-full border border-line bg-card px-2.5 py-1.5 text-xs text-ink-2 outline-none" aria-label="Reading speed">
            {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
