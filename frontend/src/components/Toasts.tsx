import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Info, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export interface Toast { id: number; message: string; tone: "info" | "error" }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((message: string, tone: "info" | "error" = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, tone }].slice(-4));
    window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
  }, [dismiss]);
  return { toasts, notify, dismiss };
}

export function Toaster({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.tone === "error"
                ? "border-red-300/60 bg-red-50/95 text-red-900 dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-100"
                : "border-line bg-card/95 text-ink"
            }`}
            role="status"
          >
            {t.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" />}
            <span className="leading-relaxed">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 rounded-full p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
