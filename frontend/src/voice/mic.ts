// Shared microphone stream + voice activity detection (VAD) on raw audio levels.

let streamPromise: Promise<MediaStream> | null = null;
let audioCtx: AudioContext | null = null;

export function getMicStream(): Promise<MediaStream> {
  if (!streamPromise) {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error("Microphone not supported in this browser."));
    streamPromise = navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch((err) => { streamPromise = null; throw err; });
  }
  return streamPromise;
}

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export interface VadOptions {
  /** Minimum RMS that counts as speech regardless of noise floor. */
  threshold?: number;
  /** Continuous speech needed before onSpeechStart fires. */
  minSpeechMs?: number;
  /** Continuous silence (after speech) before onSpeechEnd fires. */
  silenceMs?: number;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

/** Energy-based VAD with an adaptive noise floor. Cheap, local, good enough for barge-in. */
export class VoiceActivityDetector {
  private timer: number | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private speaking = false;
  private aboveSince = 0;
  private belowSince = 0;
  private floor = 0.005;

  constructor(private stream: MediaStream, private opts: VadOptions) {}

  start(): void {
    const ctx = getAudioContext();
    this.source = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const { threshold = 0.02, minSpeechMs = 250, silenceMs = 1200 } = this.opts;

    // setInterval rather than rAF so it keeps working in background tabs.
    this.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      this.opts.onLevel?.(Math.min(1, rms * 12));

      const now = performance.now();
      const isLoud = rms > Math.max(threshold, this.floor * 3);
      if (!isLoud && !this.speaking) this.floor = this.floor * 0.95 + rms * 0.05;

      if (isLoud) {
        this.belowSince = 0;
        if (!this.aboveSince) this.aboveSince = now;
        if (!this.speaking && now - this.aboveSince >= minSpeechMs) {
          this.speaking = true;
          this.opts.onSpeechStart?.();
        }
      } else {
        this.aboveSince = 0;
        if (this.speaking) {
          if (!this.belowSince) this.belowSince = now;
          if (now - this.belowSince >= silenceMs) {
            this.speaking = false;
            this.opts.onSpeechEnd?.();
          }
        }
      }
    }, 30);
  }

  get isSpeaking(): boolean { return this.speaking; }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.source = null;
    this.opts.onLevel?.(0);
  }
}
