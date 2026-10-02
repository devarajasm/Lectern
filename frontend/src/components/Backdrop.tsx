import { motion, useReducedMotion } from "motion/react";
import type { ReadingStatus } from "../api/client";
import type { Ambience } from "../appearance";

// Status colours for the aurora (match the agent orb). Idle states use the accent colour.
const STATUS_GLOW: Partial<Record<ReadingStatus, [string, string]>> = {
  READING: ["#fb923c", "#f59e0b"],
  LISTENING: ["#2dd4bf", "#38bdf8"],
  ANSWERING: ["#a78bfa", "#f472b6"],
  RESUMING: ["#4ade80", "#2dd4bf"],
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

interface Props { ambience: Ambience; status?: ReadingStatus }

/** Decorative full-screen background behind the app. Purely visual; ignores pointer events. */
export function Backdrop({ ambience, status }: Props) {
  const reduce = useReducedMotion();
  if (ambience === "none") return null;

  if (ambience === "grain") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply dark:opacity-[0.09] dark:mix-blend-screen" style={{ backgroundImage: GRAIN }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, color-mix(in oklab, var(--ink) 7%, transparent) 100%)" }} />
      </div>
    );
  }

  if (ambience === "gradient") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{
        background: [
          "radial-gradient(60% 50% at 10% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)",
          "radial-gradient(50% 45% at 100% 100%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)",
          "radial-gradient(40% 35% at 85% 10%, color-mix(in oklab, var(--ink) 5%, transparent), transparent 70%)",
        ].join(","),
      }} />
    );
  }

  // Aurora: three large blurred blobs drifting slowly; hues follow the agent's state.
  const [a, b] = (status && STATUS_GLOW[status]) ?? ["var(--accent)", "color-mix(in oklab, var(--accent) 60%, #ffffff)"];
  const blobs = [
    { color: a, size: "55vmax", x: ["-10%", "8%", "-10%"], y: ["-15%", "5%", "-15%"], pos: "left-[-15%] top-[-20%]", dur: 26 },
    { color: b, size: "45vmax", x: ["10%", "-6%", "10%"], y: ["10%", "-8%", "10%"], pos: "right-[-15%] bottom-[-20%]", dur: 32 },
    { color: a, size: "30vmax", x: ["0%", "12%", "0%"], y: ["0%", "10%", "0%"], pos: "left-[35%] top-[30%]", dur: 38 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-[0.16] blur-[90px] dark:opacity-[0.20] ${blob.pos}`}
          style={{ width: blob.size, height: blob.size }}
          animate={{
            background: `radial-gradient(circle, ${blob.color} 0%, transparent 65%)`,
            ...(reduce ? {} : { x: blob.x, y: blob.y }),
          }}
          transition={{
            background: { duration: 1.6, ease: "easeInOut" },
            x: { duration: blob.dur, repeat: Infinity, ease: "easeInOut" },
            y: { duration: blob.dur * 1.2, repeat: Infinity, ease: "easeInOut" },
          }}
        />
      ))}
    </div>
  );
}
