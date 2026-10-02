// Engine-independent speech interfaces. Two implementations exist:
//   server  — Azure OpenAI / OpenAI via the backend (/api/tts, /api/stt)
//   browser — the Web Speech API, fully in the browser

export type EngineId = "server" | "browser";

/** Thrown when speech/listening is stopped on purpose. Never shown to the user. */
export class Cancelled extends Error {
  constructor() { super("cancelled"); this.name = "Cancelled"; }
}

/** A real failure of an engine (network, permission, unsupported...). Triggers fallback. */
export class EngineError extends Error {
  constructor(message: string, public readonly fatal = false) { super(message); this.name = "EngineError"; }
}

export interface SpeakOptions {
  rate: number;
  voice?: string;
  /** "narration" for the book, "conversation" for answers (cloud voices only). */
  style?: "narration" | "conversation";
  /** Narration persona, e.g. "storyteller" | "calm" | "expressive" (cloud voices only). */
  persona?: string;
  /** Character index (within the spoken text) of the word currently being spoken. */
  onBoundary?: (charIndex: number) => void;
}

export interface TTSEngine {
  readonly id: EngineId;
  speak(text: string, opts: SpeakOptions): Promise<void>;
  /** Warm up the next utterance so there is no gap between sentences. */
  prefetch?(text: string, opts: SpeakOptions): void;
  stop(): void;
  /** Approximate character index reached in the current/last utterance. */
  position(): number;
}

export interface ListenOptions {
  onPartial?: (text: string) => void;
  onLevel?: (level: number) => void;
  /** Resolve with "" if the user does not start speaking within this time. */
  noSpeechTimeoutMs?: number;
}

export interface STTEngine {
  readonly id: EngineId;
  listen(opts: ListenOptions): Promise<string>;
  /** User signalled they are done talking: stop and transcribe what we have. */
  finish(): void;
  abort(): void;
}
