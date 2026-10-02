// Hands-free interruption: while the book is being read, detect the listener
// starting to talk and interrupt. Relies on browser echo cancellation; works
// best with headphones.
import { getMicStream, VoiceActivityDetector } from "./mic";

export class BargeInDetector {
  private vad: VoiceActivityDetector | null = null;
  private stopped = false;

  constructor(private onSpeech: () => void, private onLevel?: (l: number) => void) {}

  async start(): Promise<void> {
    const stream = await getMicStream();
    if (this.stopped) return;
    this.vad = new VoiceActivityDetector(stream, {
      threshold: 0.045,   // higher than normal: ignore speaker bleed
      minSpeechMs: 320,
      onLevel: this.onLevel,
      onSpeechStart: () => this.onSpeech(),
    });
    this.vad.start();
  }

  stop(): void {
    this.stopped = true;
    this.vad?.stop();
    this.vad = null;
  }
}
