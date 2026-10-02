import { Loader2, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrowserTTS } from "../voice/browserEngine";
import { ServerTTS } from "../voice/serverEngine";
import { Cancelled } from "../voice/types";

const SAMPLE =
  "The lamp had been dark for twenty years. Nobody in the village spoke of it — but that night, as the fog rolled in, Mara swore she saw it flicker.";

interface Props { engine: "server" | "browser"; voice: string; persona?: string; disabled?: boolean }

/** Plays a short sample with the selected voice and style. */
export function VoicePreview({ engine, voice, persona, disabled }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const tts = useRef(engine === "server" ? new ServerTTS() : new BrowserTTS());
  useEffect(() => () => tts.current.stop(), []);
  useEffect(() => { tts.current.stop(); setState("idle"); }, [voice, persona]);

  const toggle = async () => {
    if (state !== "idle") { tts.current.stop(); setState("idle"); return; }
    setState(engine === "server" ? "loading" : "playing");
    const poll = window.setInterval(() => { if (tts.current.position() > 0) setState("playing"); }, 150);
    try {
      await tts.current.speak(SAMPLE, { rate: 1, voice: voice || undefined, persona, style: "narration" });
    } catch (err) {
      if (!(err instanceof Cancelled)) alert((err as Error).message);
    } finally {
      window.clearInterval(poll);
      setState("idle");
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={disabled}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-paper-2 disabled:opacity-40"
      aria-label="Preview voice">
      {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : state === "playing" ? <Square className="size-3.5" fill="currentColor" /> : <Play className="size-3.5" fill="currentColor" />}
      Preview
    </button>
  );
}
