// Chooses the active speech engines and falls back to the browser engine
// automatically when server speech (Azure OpenAI / OpenAI) is unavailable.
import { BrowserSTT, BrowserTTS, browserSTTSupported, browserTTSSupported } from "./browserEngine";
import { ServerSTT, ServerTTS } from "./serverEngine";
import { Cancelled, EngineError, type EngineId, type ListenOptions, type SpeakOptions, type STTEngine, type TTSEngine } from "./types";

export interface VoicePrefs {
  engine: EngineId;
  /** Cloud text-to-speech / speech-to-text work (checked by the backend before use). */
  serverTTSAvailable: boolean;
  serverSTTAvailable: boolean;
  serverVoice?: string;
  browserVoice?: string;
  persona?: string;
}

type FallbackListener = (kind: "voice" | "listening", reason: string) => void;

export class VoiceManager {
  private serverTTS = new ServerTTS();
  private browserTTS = new BrowserTTS();
  private serverSTT = new ServerSTT();
  private browserSTT = new BrowserSTT();
  private ttsFellBack = false;
  private sttFellBack = false;
  private lastTTS: TTSEngine = this.browserTTS;
  private lastSTT: STTEngine = this.browserSTT;

  constructor(private getPrefs: () => VoicePrefs, private onFallback: FallbackListener) {}

  /** Reset fallback state (e.g. the user switched engines or providers). */
  resetFallback(): void { this.ttsFellBack = false; this.sttFellBack = false; }

  activeTTS(): TTSEngine {
    const p = this.getPrefs();
    const useServer = p.engine === "server" && p.serverTTSAvailable && !this.ttsFellBack;
    return useServer || !browserTTSSupported() ? this.serverTTS : this.browserTTS;
  }

  activeSTT(): STTEngine {
    const p = this.getPrefs();
    const useServer = p.engine === "server" && p.serverSTTAvailable && !this.sttFellBack;
    return useServer || !browserSTTSupported() ? this.serverSTT : this.browserSTT;
  }

  private voiceFor(engine: TTSEngine): string | undefined {
    const p = this.getPrefs();
    return (engine.id === "server" ? p.serverVoice : p.browserVoice) || undefined;
  }

  /** Cloud voices sound most natural with paragraph-sized requests; browser voices go sentence by sentence. */
  preferredSegmentChars(): number {
    return this.activeTTS().id === "server" ? 650 : 0;
  }

  async speak(text: string, opts: Omit<SpeakOptions, "voice">): Promise<void> {
    const engine = this.activeTTS();
    this.lastTTS = engine;
    try {
      await engine.speak(text, { ...opts, voice: this.voiceFor(engine), persona: this.getPrefs().persona });
    } catch (err) {
      if (err instanceof Cancelled || engine.id !== "server" || !browserTTSSupported()) throw err;
      this.ttsFellBack = true;
      this.onFallback("voice", (err as Error).message);
      this.lastTTS = this.browserTTS;
      await this.browserTTS.speak(text, { ...opts, voice: this.getPrefs().browserVoice || undefined });
    }
  }

  prefetch(text: string, opts: Omit<SpeakOptions, "voice">): void {
    const engine = this.activeTTS();
    engine.prefetch?.(text, { ...opts, voice: this.voiceFor(engine), persona: this.getPrefs().persona });
  }

  position(): number { return this.lastTTS.position(); }

  stopSpeaking(): void { this.serverTTS.stop(); this.browserTTS.stop(); }

  async listen(opts: ListenOptions): Promise<string> {
    const engine = this.activeSTT();
    this.lastSTT = engine;
    try {
      return await engine.listen(opts);
    } catch (err) {
      const canFallBack = engine.id === "server" && browserSTTSupported() && !(err instanceof EngineError && err.fatal);
      if (err instanceof Cancelled || !canFallBack) throw err;
      this.sttFellBack = true;
      this.onFallback("listening", (err as Error).message);
      this.lastSTT = this.browserSTT;
      return this.browserSTT.listen(opts);
    }
  }

  finishListening(): void { this.lastSTT.finish(); }

  abortListening(): void { this.serverSTT.abort(); this.browserSTT.abort(); }

  stopAll(): void { this.stopSpeaking(); this.abortListening(); }

  describe(): { tts: EngineId; stt: EngineId } {
    return { tts: this.activeTTS().id, stt: this.activeSTT().id };
  }
}
