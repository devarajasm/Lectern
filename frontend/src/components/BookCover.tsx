// A generated, deterministic cover for books (PDFs rarely have usable cover art).

const PALETTES = [
  ["#7c2d12", "#ea580c"], ["#1e3a8a", "#3b82f6"], ["#14532d", "#22c55e"], ["#581c87", "#a855f7"],
  ["#134e4a", "#14b8a6"], ["#7f1d1d", "#ef4444"], ["#422006", "#ca8a04"], ["#1e1b4b", "#6366f1"],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function BookCover({ title, className = "" }: { title: string; className?: string }) {
  const h = hash(title);
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = 120 + (h % 90);
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-r-lg rounded-l-sm p-4 text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] ${className}`}
      style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
    >
      <div className="absolute inset-y-0 left-0 w-2 bg-black/20" />
      <div className="absolute -right-10 -bottom-10 size-40 rounded-full border-[18px] border-white/10" />
      <div className="h-px w-10 bg-white/50" />
      <h3 className="reading-text relative line-clamp-4 text-lg leading-snug font-semibold [text-wrap:balance]">{title}</h3>
      <div className="h-px w-6 bg-white/40" />
    </div>
  );
}
