// Server speech engine: TTS + STT through the backend (Azure OpenAI or OpenAI).
import { api } from "../api/client";
import { getMicStream, VoiceActivityDetector } from "./mic";
import { Cancelled, EngineError, type ListenOptions, type SpeakOptions, type STTEngine, type TTSEngine } from "./types";

const CACHE_LIMIT = 6;

export class ServerTTS implements TTSEngine {
  readonly id = "server" as const;
  private audio = new Audio();
  private cache = new Map<string, Promise<string>>();
  private current: { text: string; reject: (e: Error) => void } | null = null;

  private key(text: string, o: SpeakOptions) { return `${o.voice ?? ""}|${o.style ?? ""}|${o.persona ?? ""}|${text}`; }

  private fetchUrl(text: string, o: SpeakOptions): Promise<string> {
    const key = this.key(text, o);
    let entry = this.cache.get(key);
    if (!entry) {
      entry = api.tts(text, { voice: o.voice, style: o.style, persona: o.persona }).then((blob) => URL.createObjectURL(blob));
      entry.catch(() => this.cache.delete(key));
      this.cache.set(key, entry);
      while (this.cache.size > CACHE_LIMIT) {
        const [oldKey, oldUrl] = this.cache.entries().next().value!;
        this.cache.delete(oldKey);
        oldUrl.then((u) => URL.revokeObjectURL(u)).catch(() => {});
      }
    }
    return entry;
  }

  prefetch(text: string, opts: SpeakOptions): void {
    void this.fetchUrl(text, opts).catch(() => {});
  }

  speak(text: string, opts: SpeakOptions): Promise<void> {
    this.stop();
    return new Promise<void>((resolve, reject) => {
      const token = { text, reject };
      this.current = token;
      this.fetchUrl(text, opts)
        .then((url) => {
          if (this.current !== token) return reject(new Cancelled());
          const audio = this.audio;
          audio.src = url;
          audio.playbackRate = opts.rate;
          audio.onended = () => { if (this.current === token) { this.current = null; resolve(); } };
          audio.onerror = () => { if (this.current === token) { this.current = null; reject(new EngineError("Audio playback failed.")); } };
          audio.play().catch((err: Error) => {
            if (this.current !== token) return;
            this.current = null;
            reject(err.name === "NotAllowedError" ? new EngineError("Browser blocked audio playback — click Play.") : new EngineError(err.message));
          });
        })
        .catch((err: Error) => {
          if (this.current !== token) return reject(new Cancelled());
          this.current = null;
          reject(new EngineError(err.message));
        });
    });
  }

  position(): number {
    const { audio, current } = this;
    if (!current || !Number.isFinite(audio.duration) || audio.duration === 0) return 0;
    return Math.floor((audio.currentTime / audio.duration) * current.text.length);
  }

  stop(): void {
    const current = this.current;
    this.current = null;
    this.audio.pause();
    this.audio.onended = null;
    this.audio.onerror = null;
    current?.reject(new Cancelled());
  }
}

function pickMimeType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

export class ServerSTT implements STTEngine {
  readonly id = "server" as const;
  private session: { finish: () => void; abort: () => void } | null = null;

  async listen(opts: ListenOptions): Promise<string> {
    this.abort();
    let stream: MediaStream;
    try {
      stream = await getMicStream();
    } catch (err) {
      throw new EngineError(`Microphone unavailable: ${(err as Error).message}`, true);
    }

    return new Promise<string>((resolve, reject) => {
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      const parts: Blob[] = [];
      let heardSpeech = false;
      let aborted = false;
      let settled = false;
      const timers: number[] = [];

      const cleanup = () => { vad.stop(); timers.forEach((t) => window.clearTimeout(t)); this.session = null; };
      const finish = () => { if (recorder.state !== "inactive") recorder.stop(); };
      const abort = () => { aborted = true; finish(); };

      const vad = new VoiceActivityDetector(stream, {
        silenceMs: 1100,
        onLevel: opts.onLevel,
        onSpeechStart: () => { heardSpeech = true; opts.onPartial?.("…"); },
        onSpeechEnd: finish,
      });

      recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      recorder.onstop = async () => {
        cleanup();
        if (settled) return;
        settled = true;
        if (aborted) return reject(new Cancelled());
        if (!heardSpeech && parts.length === 0) return resolve("");
        const blob = new Blob(parts, { type: recorder.mimeType });
        if (!heardSpeech && blob.size < 8000) return resolve("");
        try {
          opts.onPartial?.("Transcribing…");
          const { text } = await api.stt(blob);
          resolve(text);
        } catch (err) {
          reject(new EngineError((err as Error).message));
        }
      };

      this.session = { finish, abort };
      recorder.start(250);
      vad.start();
      timers.push(window.setTimeout(() => { if (!heardSpeech) finish(); }, opts.noSpeechTimeoutMs ?? 10000));
      timers.push(window.setTimeout(finish, 45000)); // hard cap per question
    });
  }

  finish(): void { this.session?.finish(); }
  abort(): void { this.session?.abort(); }
}
