import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, MessagesSquare, Settings2, Type, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReadingStatus } from "../api/client";
import { AppearancePanel } from "./AppearancePanel";
import { useReadingAgent } from "../agent/useReadingAgent";
import type { Settings } from "../settings";
import type { VoiceManager } from "../voice/voiceManager";
import { ControlBar } from "./ControlBar";
import { ConversationPanel } from "./ConversationPanel";
import { ReaderText } from "./ReaderText";

interface Props {
  bookId: string;
  voice: VoiceManager;
  settings: Settings;
  engineLabel: string;
  onSettings: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  notify: (message: string, tone?: "info" | "error") => void;
  onStatusChange?: (status: ReadingStatus) => void;
}

export function Reader({ bookId, voice, settings, engineLabel, onSettings, onBack, onOpenSettings, notify, onStatusChange }: Props) {
  const agentOptions = useMemo(
    () => ({ rate: settings.rate, bargeIn: settings.bargeIn, askToContinue: settings.askToContinue }),
    [settings.rate, settings.bargeIn, settings.askToContinue],
  );
  const agent = useReadingAgent(bookId, voice, agentOptions, notify);
  const [showChat, setShowChat] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const lookRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onStatusChange?.(agent.status); }, [agent.status, onStatusChange]);

  // Close the appearance popover on outside click / Escape.
  useEffect(() => {
    if (!showLook) return;
    const onDown = (e: MouseEvent) => { if (!lookRef.current?.contains(e.target as Node)) setShowLook(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowLook(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showLook]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") { e.preventDefault(); if (!e.repeat) void agent.interrupt(); }
      else if (e.key === "k" || e.key === "K") agent.togglePlay();
      else if (e.key === "ArrowLeft") agent.step(-1);
      else if (e.key === "ArrowRight") agent.step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent.interrupt, agent.togglePlay, agent.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const book = agent.book;
  const current = agent.chunks.get(agent.position.chunk);
  const page = current?.sentences[agent.position.sentence]?.[2] ?? null;
  const chapterIdx = book ? [...book.chapters].reverse().find((c) => c.start_chunk <= agent.position.chunk)?.index ?? 0 : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="relative z-30 flex items-center gap-2 border-b border-line bg-paper/70 px-3 py-2.5 backdrop-blur-xl sm:px-5">
        <button onClick={onBack} className="rounded-full p-2 text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Back to library"><ArrowLeft className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="reading-text truncate text-[15px] font-semibold">{book?.title ?? "…"}</div>
          {book && book.chapters.length > 1 && (
            <div className="relative inline-flex max-w-full items-center">
              <select value={chapterIdx}
                onChange={(e) => { const ch = book.chapters[Number(e.target.value)]; void agent.seek({ chunk: ch.start_chunk, sentence: 0 }); }}
                className="max-w-full appearance-none truncate bg-transparent pr-5 text-xs text-ink-3 outline-none hover:text-ink" aria-label="Jump to section">
                {book.chapters.map((c) => <option key={c.index} value={c.index}>{c.title}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 size-3 text-ink-3" />
            </div>
          )}
        </div>
        <button onClick={() => setShowChat((v) => !v)} className="rounded-full p-2 text-ink-2 hover:bg-paper-2 hover:text-ink lg:hidden" aria-label="Conversation">
          <MessagesSquare className="size-5" />
        </button>
        <div ref={lookRef} className="relative">
          <button onClick={() => setShowLook((v) => !v)} aria-expanded={showLook}
            className={`rounded-full p-2 hover:bg-paper-2 hover:text-ink ${showLook ? "bg-paper-2 text-ink" : "text-ink-2"}`} aria-label="Reading appearance" title="Reading appearance">
            <Type className="size-5" />
          </button>
          <AnimatePresence>
            {showLook && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="scrollbar-thin absolute top-12 right-0 z-40 max-h-[calc(100vh-7rem)] w-[min(92vw,360px)] overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-2xl"
              >
                <AppearancePanel value={settings} onChange={onSettings} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={onOpenSettings} className="rounded-full p-2 text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Settings"><Settings2 className="size-5" /></button>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="scrollbar-thin min-h-0 overflow-y-auto px-5 py-10 sm:px-10">
          {book && (
            <ReaderText chunks={agent.chunks} chunkVersion={agent.chunkVersion} chapters={book.chapters}
              position={agent.position} wordIndex={agent.wordIndex} onSeek={(p) => void agent.seek(p)} />
          )}
          <div className="h-[30vh]" />
        </main>

        <div className={`min-h-0 border-l border-line bg-paper-2/50 backdrop-blur-md ${showChat
          ? "absolute inset-y-0 right-0 z-20 w-full max-w-sm bg-paper shadow-2xl" : "hidden"} lg:static lg:block lg:max-w-none lg:shadow-none`}>
          {showChat && (
            <button onClick={() => setShowChat(false)} className="absolute top-4 right-4 z-10 rounded-full p-1 lg:hidden" aria-label="Close"><X className="size-4" /></button>
          )}
          <ConversationPanel turns={agent.turns} status={agent.status} partial={agent.partial} pendingQuestion={agent.pendingQuestion}
            thinking={agent.thinking} onAsk={(t) => void agent.ask(t)} onClear={() => void agent.clearConversation()} />
        </div>
      </div>

      {book && (
        <ControlBar book={book} status={agent.status} position={agent.position} page={page} level={agent.level} thinking={agent.thinking}
          rate={settings.rate} engineLabel={engineLabel} onRate={(rate) => onSettings({ rate })}
          onToggle={agent.togglePlay} onStep={agent.step} onInterrupt={() => void agent.interrupt()}
          onSeekChunk={(chunk) => void agent.seek({ chunk, sentence: 0 })} />
      )}
    </div>
  );
}
