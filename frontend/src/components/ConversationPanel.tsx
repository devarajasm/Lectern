import { AnimatePresence, motion } from "motion/react";
import { MessageCircleQuestion, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReadingStatus, Turn } from "../api/client";

interface Props {
  turns: Turn[];
  status: ReadingStatus;
  partial: string;
  pendingQuestion: string | null;
  thinking: boolean;
  onAsk: (text: string) => void;
  onClear: () => void;
}

export function ConversationPanel({ turns, status, partial, pendingQuestion, thinking, onAsk, onClear }: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, partial, pendingQuestion]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAsk(draft.trim());
    setDraft("");
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-ink-3 uppercase">Conversation</h2>
        {turns.length > 0 && (
          <button onClick={onClear} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink" title="Clear conversation">
            <Trash2 className="size-3" /> Clear
          </button>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
        {turns.length === 0 && !pendingQuestion && status !== "LISTENING" && (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-5 text-sm leading-relaxed text-ink-3">
            <MessageCircleQuestion className="mb-2 size-5 text-accent" />
            Interrupt any time — press <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[11px]">Space</kbd> and ask
            “What does that mean?”, “Who is this character?” or “Summarise this chapter so far.” Say “continue” to pick up exactly where you stopped.
          </div>
        )}

        <AnimatePresence initial={false}>
          {turns.map((t, i) => (
            <motion.div key={`${i}-${t.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[0.92rem] leading-relaxed ${
                t.role === "user" ? "rounded-br-md bg-accent text-on-accent" : "reading-text rounded-bl-md border border-line bg-card"}`}>
                {t.text}
              </div>
            </motion.div>
          ))}
          {pendingQuestion && (
            <motion.div key="pending" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[0.92rem] text-on-accent">{pendingQuestion}</div></div>
              {thinking && (
                <div className="flex gap-1.5 rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3.5 w-fit">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="size-1.5 rounded-full bg-ink-3" animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {status === "LISTENING" && (
            <motion.div key="partial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md border-2 border-dashed border-teal-500/60 px-4 py-2.5 text-[0.92rem] text-ink-2 italic">
                {partial || "Listening…"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-3 py-1.5 focus-within:border-accent">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type a question…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-3" />
          <button type="submit" disabled={!draft.trim()} className="rounded-xl bg-accent p-2 text-on-accent disabled:opacity-30" aria-label="Ask">
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
