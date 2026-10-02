// Per-browser UI preferences (voice engine, speed, theme...). The AI provider
// choice is global and lives on the backend (/api/providers).
import { useEffect, useState } from "react";
import { DEFAULT_APPEARANCE, type Appearance } from "./appearance";
import type { EngineId } from "./voice/types";

export interface Settings extends Appearance {
  engine: EngineId;
  rate: number;
  serverVoice: string;
  narrationStyle: NarrationStyle;
  browserVoice: string; // voiceURI, "" = automatic
  bargeIn: boolean;     // hands-free: start talking to interrupt
  askToContinue: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: "server",
  rate: 1,
  serverVoice: "marin",
  narrationStyle: "storyteller",
  browserVoice: "",
  bargeIn: false,
  askToContinue: true,
  ...DEFAULT_APPEARANCE,
};

export type NarrationStyle = "storyteller" | "calm" | "expressive";

export const NARRATION_STYLES: { id: NarrationStyle; label: string; hint: string }[] = [
  { id: "storyteller", label: "Storyteller", hint: "Warm, intimate audiobook narrator" },
  { id: "calm", label: "Calm", hint: "Soft and soothing, slower" },
  { id: "expressive", label: "Expressive", hint: "Dramatic, with character voices" },
];

/** Cloud voices, most natural first (marin & cedar are OpenAI's newest, most human-like voices). */
export const SERVER_VOICES: { id: string; label: string }[] = [
  { id: "marin", label: "Marin — warm, natural (recommended)" },
  { id: "cedar", label: "Cedar — deep, natural (recommended)" },
  { id: "coral", label: "Coral — bright, friendly" },
  { id: "sage", label: "Sage — calm, clear" },
  { id: "ballad", label: "Ballad — soft, expressive" },
  { id: "verse", label: "Verse — lively" },
  { id: "ash", label: "Ash" }, { id: "alloy", label: "Alloy" }, { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" }, { id: "nova", label: "Nova" }, { id: "onyx", label: "Onyx" },
  { id: "shimmer", label: "Shimmer" },
];

const KEY = "lectern.settings.v1";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const merged: Settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    if (!merged.serverVoice) merged.serverVoice = DEFAULT_SETTINGS.serverVoice; // migrate "server default"
    const legacyTheme = merged.theme as string; // v0.1 stored "light" / "dark"
    if (legacyTheme === "light") merged.theme = "paper";
    if (legacyTheme === "dark") merged.theme = "night";
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings]);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update] as const;
}
