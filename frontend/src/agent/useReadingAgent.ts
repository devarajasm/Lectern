// The reading agent: drives READING → LISTENING → ANSWERING → RESUMING.
//
// The backend owns the persisted position; this hook mirrors it, plays sentences
// one by one, and reports every position change so a restart resumes exactly.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type BookDetail, type Chunk, type ReadingStatus, type Turn } from "../api/client";
import { BargeInDetector } from "../voice/bargeIn";
import { Cancelled } from "../voice/types";
import type { VoiceManager } from "../voice/voiceManager";

export interface Position { chunk: number; sentence: number }

export interface AgentOptions {
  rate: number;
  bargeIn: boolean;
  askToContinue: boolean;
}

type Notify = (message: string, tone?: "info" | "error") => void;

const CHUNK_WINDOW = 6;
const CONTINUE_PROMPT = "Shall I continue reading?";

/** Last sentence index of the utterance starting at sentence `s`: same paragraph, at most `maxChars`.
 *  maxChars <= 0 means one sentence at a time. */
export function segmentEnd(c: Chunk, s: number, maxChars: number): number {
  let e = s;
  if (maxChars <= 0) return e;
  while (e + 1 < c.sentences.length) {
    const gap = c.text.slice(c.sentences[e][1], c.sentences[e + 1][0]);
    if (gap.includes("\n")) break; // paragraph boundary
    if (c.sentences[e + 1][1] - c.sentences[s][0] > maxChars) break;
    e++;
  }
  return e;
}

const segmentText = (c: Chunk, s: number, e: number) => c.text.slice(c.sentences[s][0], c.sentences[e][1]);

export function useReadingAgent(bookId: string, voice: VoiceManager, options: AgentOptions, notify: Notify) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [status, setStatusState] = useState<ReadingStatus>("IDLE");
  const [position, setPositionState] = useState<Position>({ chunk: 0, sentence: 0 });
  const [wordIndex, setWordIndex] = useState<number | null>(null);
  const [chunkVersion, setChunkVersion] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [speakingAnswer, setSpeakingAnswer] = useState(false);
  const [level, setLevel] = useState(0);

  const chunks = useRef(new Map<number, Chunk>());
  const inflight = useRef(new Map<number, Promise<void>>());
  const statusRef = useRef<ReadingStatus>("IDLE");
  const posRef = useRef<Position>({ chunk: 0, sentence: 0 });
  const runRef = useRef(0); // bumping this cancels whatever loop is running
  const optsRef = useRef(options);
  optsRef.current = options;
  const bookRef = useRef<BookDetail | null>(null);
  const speakingAnswerRef = useRef(false);

  const setStatus = useCallback((s: ReadingStatus) => { statusRef.current = s; setStatusState(s); }, []);
  const setPosition = useCallback((p: Position) => { posRef.current = p; setPositionState(p); }, []);
  const setAnswerSpeaking = (v: boolean) => { speakingAnswerRef.current = v; setSpeakingAnswer(v); };

  // ------------------------------------------------------------------ chunk cache

  const ensureChunks = useCallback(async (index: number) => {
    const b = bookRef.current;
    if (!b || index < 0 || index >= b.chunk_count || chunks.current.has(index)) return;
    const windowStart = Math.max(0, index - 1);
    let p = inflight.current.get(windowStart);
    if (!p) {
      p = api.getChunks(bookId, windowStart, CHUNK_WINDOW).then((list) => {
        list.forEach((c) => chunks.current.set(c.index, c));
        setChunkVersion((v) => v + 1);
      }).finally(() => inflight.current.delete(windowStart));
      inflight.current.set(windowStart, p);
    }
    await p;
  }, [bookId]);

  const getChunk = useCallback(async (index: number) => {
    await ensureChunks(index);
    return chunks.current.get(index) ?? null;
  }, [ensureChunks]);

  const segStartRef = useRef(0); // char offset (within the chunk) where the current utterance starts

  // ------------------------------------------------------------------ load

  useEffect(() => {
    let cancelled = false;
    chunks.current.clear();
    (async () => {
      try {
        const [b, state, history] = await Promise.all([api.getBook(bookId), api.getState(bookId), api.conversation(bookId)]);
        if (cancelled) return;
        bookRef.current = b;
        setBook(b);
        setTurns(history);
        setPosition({ chunk: state.chunk_index, sentence: state.sentence_index });
        // After a reload/restart nothing is playing, so any "active" state becomes PAUSED.
        const restored: ReadingStatus = state.status === "IDLE" || state.status === "FINISHED" ? state.status : "PAUSED";
        setStatus(restored);
        await ensureChunks(state.chunk_index);
      } catch (err) {
        notify((err as Error).message, "error");
      }
    })();
    return () => {
      cancelled = true;
      runRef.current++;
      voice.stopAll();
    };
  }, [bookId, voice, ensureChunks, notify, setPosition, setStatus]);

  const persist = useCallback((p: Position, s?: ReadingStatus) => {
    api.setPosition(bookId, { chunk_index: p.chunk, sentence_index: p.sentence, status: s }).catch(() => {});
  }, [bookId]);

  // ------------------------------------------------------------------ READING

  const readFrom = useCallback(async (start: Position) => {
    const run = ++runRef.current;
    voice.stopAll();
    setStatus("READING");
    let { chunk: c, sentence: s } = start;

    while (run === runRef.current) {
      const b = bookRef.current;
      if (!b) return;
      if (c >= b.chunk_count) {
        setStatus("FINISHED");
        api.setStatus(bookId, "FINISHED").catch(() => {});
        notify("You've reached the end of the book.");
        return;
      }
      const chunk = await getChunk(c);
      if (run !== runRef.current) return;
      if (!chunk) { notify("Could not load the next passage.", "error"); setStatus("PAUSED"); return; }
      if (s >= chunk.sentences.length) { c += 1; s = 0; continue; }

      // Cloud voices get a whole paragraph (up to ~650 chars) so intonation flows naturally
      // across sentences; browser voices go sentence by sentence.
      const maxChars = voice.preferredSegmentChars();
      const e = segmentEnd(chunk, s, maxChars);
      const segStart = chunk.sentences[s][0];
      segStartRef.current = segStart;

      const pos = { chunk: c, sentence: s };
      setPosition(pos);
      setWordIndex(null);
      persist(pos, "READING");

      // Warm up what comes next so there is no gap between segments.
      void ensureChunks(c + 1);
      const nextChunk = chunks.current.get(c + 1);
      const next = e + 1 < chunk.sentences.length ? segmentText(chunk, e + 1, segmentEnd(chunk, e + 1, maxChars))
        : nextChunk ? segmentText(nextChunk, 0, segmentEnd(nextChunk, 0, maxChars)) : null;
      if (next) voice.prefetch(next, { rate: optsRef.current.rate, style: "narration" });

      // Follow playback inside the segment: highlight the sentence being spoken and keep the
      // persisted position on it, so an interruption or restart resumes at the right sentence.
      const track = (offsetInSegment: number, isWordBoundary: boolean) => {
        if (run !== runRef.current) return;
        const abs = segStart + offsetInSegment;
        let i = s;
        while (i < e && abs >= chunk.sentences[i + 1][0]) i++;
        if (i !== posRef.current.sentence || c !== posRef.current.chunk) {
          const p = { chunk: c, sentence: i };
          setPosition(p);
          persist(p, "READING");
          if (!isWordBoundary) setWordIndex(null);
        }
        if (isWordBoundary) setWordIndex(abs - chunk.sentences[i][0]);
      };
      const poll = e > s ? window.setInterval(() => track(voice.position(), false), 200) : null;

      try {
        await voice.speak(segmentText(chunk, s, e), {
          rate: optsRef.current.rate,
          style: "narration",
          onBoundary: (i) => track(i, true),
        });
      } catch (err) {
        if (err instanceof Cancelled || run !== runRef.current) return;
        notify((err as Error).message, "error");
        setStatus("PAUSED");
        persist(posRef.current, "PAUSED");
        return;
      } finally {
        if (poll !== null) window.clearInterval(poll);
      }
      if (run !== runRef.current) return;
      s = e + 1;
    }
  }, [bookId, voice, getChunk, ensureChunks, notify, persist, setPosition, setStatus]);

  // ------------------------------------------------------------------ LISTENING / ANSWERING

  const listenRef = useRef<(followUp: boolean) => Promise<void>>(async () => {});

  const handleUtterance = useCallback(async (text: string, run: number) => {
    setPendingQuestion(text);
    setThinking(true);
    setStatus("ANSWERING");
    let result;
    try {
      result = await api.converse(bookId, text);
    } catch (err) {
      if (run !== runRef.current) return;
      setThinking(false);
      setPendingQuestion(null);
      const msg = err instanceof ApiError && err.status === 503
        ? `${err.message} Choose another AI provider in Settings.`
        : (err as Error).message;
      notify(msg, "error");
      setStatus("PAUSED");
      return;
    }
    if (run !== runRef.current) return;
    setThinking(false);
    setPendingQuestion(null);
    const state = result.state;

    switch (result.intent) {
      case "QUESTION": {
        const answer = result.answer ?? "";
        setTurns((t) => [...t,
          { role: "user", text, chunk_index: state.chunk_index, created_at: "" },
          { role: "assistant", text: answer, chunk_index: state.chunk_index, created_at: "" }]);
        setAnswerSpeaking(true);
        try {
          await voice.speak(answer, { rate: optsRef.current.rate, style: "conversation" });
          if (run !== runRef.current) return;
          if (optsRef.current.askToContinue) await voice.speak(CONTINUE_PROMPT, { rate: optsRef.current.rate, style: "conversation" });
        } catch (err) {
          if (err instanceof Cancelled || run !== runRef.current) return;
          notify((err as Error).message, "error");
        } finally {
          if (run === runRef.current) setAnswerSpeaking(false);
        }
        if (run !== runRef.current) return;
        if (optsRef.current.askToContinue) {
          await listenRef.current(true);
        } else {
          setStatus("PAUSED");
          api.setStatus(bookId, "PAUSED").catch(() => {});
        }
        return;
      }
      case "RESUME":
      case "START":
      case "RESTART":
      case "REPEAT": {
        setStatus("RESUMING");
        const pos = { chunk: state.chunk_index, sentence: state.sentence_index };
        setPosition(pos);
        await new Promise((r) => setTimeout(r, 450)); // let the RESUMING state register visually
        if (run !== runRef.current) return;
        await readFrom(pos);
        return;
      }
      case "STOP":
        setStatus("PAUSED");
        return;
      case "EMPTY":
        await listenRef.current(false); // e.g. "wait…" — keep listening for the question
        return;
    }
  }, [bookId, voice, notify, readFrom, setPosition, setStatus]);

  const listen = useCallback(async (followUp: boolean) => {
    const run = ++runRef.current;
    setStatus("LISTENING");
    setPartial("");
    let text = "";
    try {
      text = await voice.listen({
        onPartial: setPartial,
        onLevel: setLevel,
        noSpeechTimeoutMs: followUp ? 7000 : 10000,
      });
    } catch (err) {
      if (err instanceof Cancelled || run !== runRef.current) return;
      notify((err as Error).message, "error");
      setStatus("PAUSED");
      api.setStatus(bookId, "PAUSED").catch(() => {});
      return;
    } finally {
      setLevel(0);
    }
    if (run !== runRef.current) return;
    setPartial("");
    if (!text.trim()) {
      setStatus("PAUSED");
      api.setStatus(bookId, "PAUSED").catch(() => {});
      if (!followUp) notify("I didn't catch that. Press Space to try again, or type your question.");
      return;
    }
    await handleUtterance(text, run);
  }, [bookId, voice, notify, handleUtterance, setStatus]);
  listenRef.current = listen;

  // ------------------------------------------------------------------ public actions

  /** Interrupt reading (or the spoken answer) and start listening. Second press finishes listening. */
  const interrupt = useCallback(async () => {
    const s = statusRef.current;
    if (s === "LISTENING") { voice.finishListening(); return; }
    if (s === "ANSWERING" && !speakingAnswerRef.current) return; // still thinking

    if (s === "READING") {
      runRef.current++;
      const offset = segStartRef.current + voice.position();
      voice.stopSpeaking();
      const { chunk } = posRef.current;
      const c = chunks.current.get(chunk);
      if (c) api.interrupt(bookId, chunk, Math.min(offset, c.text.length)).catch(() => {});
    } else {
      voice.stopSpeaking();
      setAnswerSpeaking(false);
    }
    await listen(false);
  }, [bookId, voice, listen]);

  const play = useCallback(async () => {
    const s = statusRef.current;
    if (s === "FINISHED") { await readFrom({ chunk: 0, sentence: 0 }); return; }
    if (s === "IDLE") { await readFrom(posRef.current); return; }
    // Resume from the persisted interruption point (start of the interrupted sentence).
    setStatus("RESUMING");
    try {
      const state = await api.resume(bookId);
      await readFrom({ chunk: state.chunk_index, sentence: state.sentence_index });
    } catch (err) {
      notify((err as Error).message, "error");
      setStatus("PAUSED");
    }
  }, [bookId, readFrom, notify, setStatus]);

  const pause = useCallback(() => {
    runRef.current++;
    voice.stopAll();
    setAnswerSpeaking(false);
    setThinking(false);
    setPendingQuestion(null);
    setStatus("PAUSED");
    persist(posRef.current, "PAUSED");
  }, [voice, persist, setStatus]);

  const togglePlay = useCallback(() => {
    const s = statusRef.current;
    if (s === "READING" || s === "LISTENING" || s === "ANSWERING" || s === "RESUMING") pause();
    else void play();
  }, [pause, play]);

  /** Jump to a sentence. Keeps reading if we were reading. */
  const seek = useCallback(async (target: Position) => {
    const b = bookRef.current;
    if (!b) return;
    let { chunk, sentence } = target;
    chunk = Math.max(0, Math.min(chunk, b.chunk_count - 1));
    const c = await getChunk(chunk);
    if (!c) return;
    if (sentence < 0) {
      if (chunk === 0) sentence = 0;
      else {
        const prev = await getChunk(chunk - 1);
        chunk -= 1;
        sentence = prev ? prev.sentences.length - 1 : 0;
      }
    } else if (sentence >= c.sentences.length) {
      if (chunk + 1 >= b.chunk_count) sentence = c.sentences.length - 1;
      else { chunk += 1; sentence = 0; }
    }
    const pos = { chunk, sentence };
    if (statusRef.current === "READING") { await readFrom(pos); return; }
    runRef.current++;
    voice.stopAll();
    setPosition(pos);
    setWordIndex(null);
    const nextStatus = statusRef.current === "IDLE" ? "IDLE" : "PAUSED";
    setStatus(nextStatus);
    persist(pos, nextStatus);
    void ensureChunks(chunk);
  }, [getChunk, readFrom, voice, setPosition, setStatus, persist, ensureChunks]);

  const step = useCallback((delta: number) => {
    const p = posRef.current;
    void seek({ chunk: p.chunk, sentence: p.sentence + delta });
  }, [seek]);

  /** Typed question (fallback when no microphone / speech recognition). */
  const ask = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const s = statusRef.current;
    if (s === "READING") {
      const offset = segStartRef.current + voice.position();
      const { chunk } = posRef.current;
      const c = chunks.current.get(chunk);
      runRef.current++;
      voice.stopAll();
      if (c) await api.interrupt(bookId, chunk, Math.min(offset, c.text.length)).catch(() => {});
    }
    const run = ++runRef.current;
    voice.stopAll();
    await handleUtterance(text, run);
  }, [bookId, voice, handleUtterance]);

  const renameBook = useCallback(async (title: string) => {
    const updated = await api.renameBook(bookId, title);
    setBook((b) => (b ? { ...b, title: updated.title } : b));
    if (bookRef.current) bookRef.current = { ...bookRef.current, title: updated.title };
  }, [bookId]);

  const clearConversation = useCallback(async () => {
    await api.clearConversation(bookId);
    setTurns([]);
  }, [bookId]);

  // ------------------------------------------------------------------ hands-free barge-in

  const interruptRef = useRef(interrupt);
  interruptRef.current = interrupt;
  useEffect(() => {
    if (!options.bargeIn || status !== "READING") return;
    const detector = new BargeInDetector(() => void interruptRef.current());
    detector.start().catch((err) => notify(`Hands-free mode needs the microphone: ${(err as Error).message}`, "error"));
    return () => detector.stop();
  }, [options.bargeIn, status, notify]);

  return {
    book, status, position, wordIndex, turns, partial, pendingQuestion, thinking, speakingAnswer, level,
    chunks: chunks.current, chunkVersion,
    play, pause, togglePlay, interrupt, seek, step, ask, clearConversation, ensureChunks, renameBook,
  };
}

export type ReadingAgent = ReturnType<typeof useReadingAgent>;
