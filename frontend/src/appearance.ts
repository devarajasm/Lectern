// Visual customisation: reading themes, accent colours, ambient backgrounds and typography.
// Everything is applied as data-attributes / CSS variables on <html>, so components only
// ever use the semantic tokens (bg-paper, text-ink, bg-accent, ...).
import { useEffect } from "react";

export type ThemeId = "system" | "paper" | "sepia" | "slate" | "night" | "midnight" | "forest";
export type AccentId = "ember" | "rose" | "violet" | "ocean" | "teal" | "gold";
export type Ambience = "none" | "gradient" | "aurora" | "grain";
export type ReadingFont = "literata" | "source-serif" | "garamond" | "merriweather" | "inter" | "atkinson";
export type TextWidth = "narrow" | "medium" | "wide";
export type HighlightStyle = "marker" | "underline" | "glow";

export interface Appearance {
  theme: ThemeId;
  accent: AccentId;
  ambience: Ambience;
  readingFont: ReadingFont;
  fontSize: number;   // px
  lineHeight: number; // unitless
  textWidth: TextWidth;
  highlight: HighlightStyle;
  focusMode: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  accent: "ember",
  ambience: "aurora",
  readingFont: "literata",
  fontSize: 20,
  lineHeight: 1.85,
  textWidth: "medium",
  highlight: "marker",
  focusMode: false,
};

/** Swatch colours mirror the CSS themes in index.css. */
export const THEMES: { id: Exclude<ThemeId, "system">; label: string; dark: boolean; paper: string; ink: string }[] = [
  { id: "paper", label: "Paper", dark: false, paper: "#f6f1e8", ink: "#26211c" },
  { id: "sepia", label: "Sepia", dark: false, paper: "#f1e5c9", ink: "#3b2f22" },
  { id: "slate", label: "Slate", dark: true, paper: "#1e2125", ink: "#e6e8eb" },
  { id: "night", label: "Night", dark: true, paper: "#15130f", ink: "#ece4d8" },
  { id: "midnight", label: "Midnight", dark: true, paper: "#0d1321", ink: "#e3e8f4" },
  { id: "forest", label: "Forest", dark: true, paper: "#0f1a15", ink: "#e2ece5" },
];

export const ACCENTS: { id: AccentId; label: string; color: string }[] = [
  { id: "ember", label: "Ember", color: "#e0601f" },
  { id: "rose", label: "Rose", color: "#e11d48" },
  { id: "violet", label: "Violet", color: "#7c3aed" },
  { id: "ocean", label: "Ocean", color: "#0284c7" },
  { id: "teal", label: "Teal", color: "#0d9488" },
  { id: "gold", label: "Gold", color: "#ca8a04" },
];

export const AMBIENCES: { id: Ambience; label: string; hint: string }[] = [
  { id: "aurora", label: "Aurora", hint: "Soft light that follows the agent" },
  { id: "gradient", label: "Glow", hint: "Gentle static gradient" },
  { id: "grain", label: "Paper", hint: "Subtle paper texture" },
  { id: "none", label: "Plain", hint: "No background" },
];

export const FONTS: { id: ReadingFont; label: string; family: string }[] = [
  { id: "literata", label: "Literata", family: '"Literata Variable", Georgia, serif' },
  { id: "source-serif", label: "Source Serif", family: '"Source Serif 4 Variable", Georgia, serif' },
  { id: "garamond", label: "Garamond", family: '"EB Garamond Variable", Garamond, serif' },
  { id: "merriweather", label: "Merriweather", family: '"Merriweather Variable", Georgia, serif' },
  { id: "inter", label: "Inter", family: '"Inter Variable", system-ui, sans-serif' },
  { id: "atkinson", label: "Hyperlegible", family: '"Atkinson Hyperlegible Next Variable", system-ui, sans-serif' },
];

export const WIDTHS: Record<TextWidth, string> = { narrow: "56ch", medium: "68ch", wide: "82ch" };

/** EB Garamond has a small x-height; nudge it up so sizes feel consistent across fonts. */
const SIZE_ADJUST: Partial<Record<ReadingFont, number>> = { garamond: 1.12, merriweather: 0.94 };

export function useAppearance(a: Appearance) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = a.theme === "system" ? (media.matches ? "night" : "paper") : a.theme;
      const dark = THEMES.find((t) => t.id === theme)?.dark ?? false;
      root.dataset.theme = theme;
      root.dataset.mode = dark ? "dark" : "light";
      root.dataset.accent = a.accent;
      root.dataset.highlight = a.highlight;
      root.dataset.focus = a.focusMode ? "on" : "off";
      const font = FONTS.find((f) => f.id === a.readingFont) ?? FONTS[0];
      root.style.setProperty("--reading-font", font.family);
      root.style.setProperty("--reading-size", `${a.fontSize * (SIZE_ADJUST[a.readingFont] ?? 1)}px`);
      root.style.setProperty("--reading-leading", String(a.lineHeight));
      root.style.setProperty("--reading-width", WIDTHS[a.textWidth]);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--paper").trim());
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [a.theme, a.accent, a.highlight, a.focusMode, a.readingFont, a.fontSize, a.lineHeight, a.textWidth]);
}
