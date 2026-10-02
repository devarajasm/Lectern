import { Check, Minus, Monitor, Plus, RotateCcw } from "lucide-react";
import {
  ACCENTS, AMBIENCES, DEFAULT_APPEARANCE, FONTS, THEMES,
  type Appearance, type HighlightStyle, type TextWidth,
} from "../appearance";

interface Props {
  value: Appearance;
  onChange: (patch: Partial<Appearance>) => void;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{children}</div>;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-paper-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${value === o.id ? "bg-card font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-ink-2">{label}</span>
      <button type="button" onClick={() => onChange(clamp(value - step))} disabled={value <= min}
        className="grid size-7 place-items-center rounded-full border border-line text-ink-2 hover:bg-paper-2 disabled:opacity-30" aria-label={`Decrease ${label}`}>
        <Minus className="size-3.5" />
      </button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="min-w-0 flex-1" aria-label={label} />
      <button type="button" onClick={() => onChange(clamp(value + step))} disabled={value >= max}
        className="grid size-7 place-items-center rounded-full border border-line text-ink-2 hover:bg-paper-2 disabled:opacity-30" aria-label={`Increase ${label}`}>
        <Plus className="size-3.5" />
      </button>
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-3">{display}</span>
    </div>
  );
}

/** Reading-appearance controls: theme, background, accent, typography, highlighting. */
export function AppearancePanel({ value, onChange }: Props) {
  const isDefault = (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]).every((k) => value[k] === DEFAULT_APPEARANCE[k]);

  return (
    <div className="space-y-5">
      <div>
        <Label>Theme</Label>
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => onChange({ theme: "system" })} title="Follow system light/dark"
            className={`group flex flex-col items-center gap-1.5 rounded-xl p-1.5 ${value.theme === "system" ? "ring-2 ring-accent" : "hover:bg-paper-2"}`}>
            <span className="relative grid h-11 w-full place-items-center overflow-hidden rounded-lg border border-line"
              style={{ background: "linear-gradient(135deg, #f6f1e8 50%, #15130f 50%)" }}>
              <Monitor className="size-4 text-[#958a7e]" />
            </span>
            <span className="text-[11px] text-ink-2">Auto</span>
          </button>
          {THEMES.map((t) => (
            <button key={t.id} type="button" onClick={() => onChange({ theme: t.id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 ${value.theme === t.id ? "ring-2 ring-accent" : "hover:bg-paper-2"}`}>
              <span className="grid h-11 w-full place-items-center rounded-lg border font-serif text-base font-semibold"
                style={{ background: t.paper, color: t.ink, borderColor: t.dark ? "#ffffff1a" : "#0000001a" }}>
                Aa
              </span>
              <span className="text-[11px] text-ink-2">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Background</Label>
        <div className="grid grid-cols-4 gap-2">
          {AMBIENCES.map((amb) => (
            <button key={amb.id} type="button" onClick={() => onChange({ ambience: amb.id })} title={amb.hint}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 ${value.ambience === amb.id ? "ring-2 ring-accent" : "hover:bg-paper-2"}`}>
              <AmbiencePreview id={amb.id} />
              <span className="text-[11px] text-ink-2">{amb.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Accent</Label>
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((a) => (
            <button key={a.id} type="button" onClick={() => onChange({ accent: a.id })} title={a.label} aria-label={a.label}
              className={`grid size-8 place-items-center rounded-full transition-transform hover:scale-110 ${value.accent === a.id ? "ring-2 ring-ink/60 ring-offset-2 ring-offset-card" : ""}`}
              style={{ background: a.color }}>
              {value.accent === a.id && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Font</Label>
        <div className="grid grid-cols-3 gap-2">
          {FONTS.map((f) => (
            <button key={f.id} type="button" onClick={() => onChange({ readingFont: f.id })}
              className={`rounded-xl border px-2 py-2 text-center transition-colors ${value.readingFont === f.id ? "border-accent bg-accent-soft/60" : "border-line hover:bg-paper-2"}`}>
              <span className="block text-lg leading-tight" style={{ fontFamily: f.family }}>Ag</span>
              <span className="block truncate text-[11px] text-ink-2">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <Label>Text</Label>
        <Stepper label="Size" value={value.fontSize} display={`${value.fontSize}px`} min={15} max={32} step={1} onChange={(fontSize) => onChange({ fontSize })} />
        <Stepper label="Spacing" value={value.lineHeight} display={value.lineHeight.toFixed(2)} min={1.4} max={2.4} step={0.05} onChange={(lineHeight) => onChange({ lineHeight })} />
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-ink-2">Width</span>
          <div className="flex-1">
            <Segmented<TextWidth> value={value.textWidth} onChange={(textWidth) => onChange({ textWidth })}
              options={[{ id: "narrow", label: "Narrow" }, { id: "medium", label: "Medium" }, { id: "wide", label: "Wide" }]} />
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <Label>Highlight</Label>
        <Segmented<HighlightStyle> value={value.highlight} onChange={(highlight) => onChange({ highlight })}
          options={[{ id: "marker", label: "Marker" }, { id: "underline", label: "Underline" }, { id: "glow", label: "Glow" }]} />
        <label className="flex cursor-pointer items-center justify-between gap-3 pt-1">
          <span>
            <span className="text-sm">Focus mode</span>
            <span className="block text-[11px] text-ink-3">Fade everything except the sentence being read</span>
          </span>
          <button type="button" role="switch" aria-checked={value.focusMode} onClick={() => onChange({ focusMode: !value.focusMode })}
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${value.focusMode ? "bg-accent" : "bg-line"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${value.focusMode ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </label>
      </div>

      {!isDefault && (
        <button type="button" onClick={() => onChange(DEFAULT_APPEARANCE)}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
          <RotateCcw className="size-3" /> Reset appearance
        </button>
      )}
    </div>
  );
}

function AmbiencePreview({ id }: { id: string }) {
  const base = "h-11 w-full overflow-hidden rounded-lg border border-line bg-paper";
  if (id === "aurora") {
    return (
      <span className={`${base} relative block`}>
        <span className="absolute -top-3 -left-2 size-10 rounded-full bg-accent opacity-50 blur-md" />
        <span className="absolute -right-2 -bottom-4 size-10 rounded-full bg-accent opacity-30 blur-md" />
      </span>
    );
  }
  if (id === "gradient") {
    return <span className={`${base} block`} style={{ background: "radial-gradient(80% 90% at 0% 0%, color-mix(in oklab, var(--accent) 30%, var(--paper)), var(--paper) 70%)" }} />;
  }
  if (id === "grain") {
    return <span className={`${base} block`} style={{ backgroundImage: "repeating-radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--ink) 9%, transparent) 0 1px, transparent 1px 3px)" }} />;
  }
  return <span className={`${base} block`} />;
}
