import { motion } from "motion/react";
import { Loader2, Mic, Volume2 } from "lucide-react";
import type { ReadingStatus } from "../api/client";

const LOOK: Record<ReadingStatus, { from: string; to: string; label: string }> = {
  IDLE:      { from: "#a8a29e", to: "#78716c", label: "Ready" },
  PAUSED:    { from: "#a8a29e", to: "#78716c", label: "Paused" },
  FINISHED:  { from: "#a8a29e", to: "#57534e", label: "Finished" },
  READING:   { from: "#fb923c", to: "#c2410c", label: "Reading" },
  LISTENING: { from: "#2dd4bf", to: "#0f766e", label: "Listening" },
  ANSWERING: { from: "#a78bfa", to: "#6d28d9", label: "Answering" },
  RESUMING:  { from: "#86efac", to: "#15803d", label: "Resuming" },
};

interface Props {
  status: ReadingStatus;
  level: number;
  thinking: boolean;
  onPress: () => void;
  size?: number;
}

/** The agent's face: colour and motion reflect the reading-loop state. Tap to talk. */
export function AgentOrb({ status, level, thinking, onPress, size = 76 }: Props) {
  const look = LOOK[status];
  const active = status === "READING" || status === "LISTENING" || status === "ANSWERING" || status === "RESUMING";
  const listening = status === "LISTENING";

  return (
    <button
      onClick={onPress}
      className="relative grid shrink-0 place-items-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
      style={{ width: size, height: size }}
      aria-label={listening ? "Done speaking" : "Ask a question"}
      title={listening ? "Done speaking (Space)" : "Interrupt and ask (Space)"}
    >
      {/* halo */}
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${look.from}55 0%, transparent 70%)` }}
        animate={active ? { scale: listening ? 1.35 + level * 0.6 : [1.15, 1.4, 1.15], opacity: [0.7, 1, 0.7] } : { scale: 1.1, opacity: 0.4 }}
        transition={listening ? { duration: 0.12 } : { duration: status === "READING" ? 3.2 : 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {listening && [0, 1].map((i) => (
        <motion.span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: look.from }}
          initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }} />
      ))}
      {/* body */}
      <motion.span
        className="absolute inset-[10%] rounded-full shadow-[inset_0_-8px_18px_rgba(0,0,0,0.25),0_12px_30px_-10px_rgba(0,0,0,0.5)]"
        animate={{
          background: `radial-gradient(circle at 32% 28%, #ffffffaa 0%, ${look.from} 28%, ${look.to} 100%)`,
          scale: status === "ANSWERING" && !thinking ? [1, 1.06, 1] : listening ? 1 + level * 0.12 : 1,
          rotate: status === "ANSWERING" ? 360 : 0,
        }}
        transition={{
          background: { duration: 0.5 },
          scale: status === "ANSWERING" ? { duration: 0.9, repeat: Infinity } : { duration: 0.12 },
          rotate: status === "ANSWERING" ? { duration: 6, repeat: Infinity, ease: "linear" } : { duration: 0.4 },
        }}
      />
      <span className="relative text-white drop-shadow">
        {thinking ? <Loader2 className="size-6 animate-spin" />
          : status === "ANSWERING" || status === "READING" ? <Volume2 className="size-6" />
          : <Mic className="size-6" />}
      </span>
      <span className="sr-only">{look.label}</span>
    </button>
  );
}

export function statusLabel(status: ReadingStatus, thinking: boolean): string {
  if (status === "ANSWERING") return thinking ? "Thinking…" : "Answering";
  return LOOK[status].label;
}

export function statusHint(status: ReadingStatus, thinking: boolean): string {
  switch (status) {
    case "READING": return "Press Space or just tap the orb to ask something";
    case "LISTENING": return "Speak now — press Space when you're done";
    case "ANSWERING": return thinking ? "Looking at the passage…" : "Press Space to interrupt the answer";
    case "RESUMING": return "Picking up where we left off";
    case "PAUSED": return "Press play to resume, or Space to ask a question";
    case "FINISHED": return "The end. Press play to start over";
    default: return "Press play to start reading";
  }
}
