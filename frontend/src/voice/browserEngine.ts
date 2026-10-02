// Browser speech engine: Web Speech API (speechSynthesis + SpeechRecognition).
import { Cancelled, EngineError, type ListenOptions, type SpeakOptions, type STTEngine, type TTSEngine } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRecognitionCtor: any =
  typeof window !== "undefined" ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export const browserTTSSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
export const browserSTTSupported = () => Boolean(SpeechRecognitionCtor);

const PREFERRED = ["natural", "neural", "premium", "enhanced", "google", "samantha", "daniel", "aria", "jenny"];

export function listBrowserVoices(): SpeechSynthesisVoice[] {
  return browserTTSSupported() ? window.speechSynthesis.getVoices() : [];
}

function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const voices = listBrowserVoices();
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  const lang = (navigator.language || "en").slice(0, 2);
  const local = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = local.length ? local : voices;
  for (const word of PREFERRED) {
    const v = pool.find((x) => x.name.toLowerCase().includes(word));
    if (v) return v;
  }
  return pool.find((v) => v.default) ?? pool[0];
}

export class BrowserTTS implements TTSEngine {
  readonly id = "browser" as const;
  private utterance: SpeechSynthesisUtterance | null = null; // keep a reference (Chrome GC bug)
  private reject: ((e: Error) => void) | null = null;
  private charIndex = 0;

  speak(text: string, opts: SpeakOptions): Promise<void> {
    if (!browserTTSSupported()) return Promise.reject(new EngineError("Speech synthesis not supported.", true));
    this.stop();
    return new Promise<void>((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(opts.voice);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = opts.rate;
      this.charIndex = 0;
      this.utterance = u;
      this.reject = reject;
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        this.charIndex = e.charIndex;
        opts.onBoundary?.(e.charIndex);
      };
      u.onend = () => { if (this.utterance === u) { this.utterance = null; this.reject = null; this.charIndex = text.length; resolve(); } };
      u.onerror = (e) => {
        if (this.utterance !== u) return;
        this.utterance = null;
        this.reject = null;
        reject(e.error === "interrupted" || e.error === "canceled" ? new Cancelled() : new EngineError(`Browser voice error: ${e.error}`));
      };
      window.speechSynthesis.speak(u);
    });
  }

  position(): number { return this.charIndex; }

  stop(): void {
    const reject = this.reject;
    this.utterance = null;
    this.reject = null;
    if (browserTTSSupported()) window.speechSynthesis.cancel();
    reject?.(new Cancelled());
  }
}

export class BrowserSTT implements STTEngine {
  readonly id = "browser" as const;
  private recognition: any = null;
  private aborted = false;

  listen(opts: ListenOptions): Promise<string> {
    if (!browserSTTSupported()) return Promise.reject(new EngineError("Speech recognition is not supported in this browser (try Chrome or Edge).", true));
    this.abort();
    return new Promise<string>((resolve, reject) => {
      const rec = new SpeechRecognitionCtor();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      this.recognition = rec;
      this.aborted = false;
      let finalText = "";
      let interim = "";
      let heard = false;
      let failed: Error | null = null;
      const timer = window.setTimeout(() => { if (!heard) rec.stop(); }, opts.noSpeechTimeoutMs ?? 10000);

      rec.onresult = (e: any) => {
        heard = true;
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        opts.onPartial?.((finalText + interim).trim());
      };
      rec.onspeechstart = () => { heard = true; };
      rec.onerror = (e: any) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        failed = new EngineError(
          e.error === "not-allowed" ? "Microphone permission denied." : `Browser speech recognition error: ${e.error}`,
          e.error === "not-allowed",
        );
      };
      rec.onend = () => {
        window.clearTimeout(timer);
        if (this.recognition === rec) this.recognition = null;
        if (this.aborted) return reject(new Cancelled());
        if (failed) return reject(failed);
        resolve((finalText || interim).trim());
      };
      try {
        rec.start();
      } catch (err) {
        window.clearTimeout(timer);
        reject(new EngineError((err as Error).message));
      }
    });
  }

  finish(): void { this.recognition?.stop(); }

  abort(): void {
    if (!this.recognition) return;
    this.aborted = true;
    this.recognition.abort();
  }
}
