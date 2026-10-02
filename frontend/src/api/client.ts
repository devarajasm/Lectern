// Typed wrappers around the backend HTTP API.

export type SpeechStyle = "narration" | "conversation";

export type ReadingStatus = "IDLE" | "READING" | "LISTENING" | "ANSWERING" | "RESUMING" | "PAUSED" | "FINISHED";

export interface Book {
  id: string;
  title: string;
  filename: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
  progress: number;
  status: ReadingStatus;
}

export interface Chapter { index: number; title: string; start_chunk: number; start_page: number }
export interface BookDetail extends Book { chapters: Chapter[] }

/** sentences: [start, end, page] character spans within `text`. */
export interface Chunk {
  index: number;
  chapter_index: number;
  page_start: number;
  page_end: number;
  text: string;
  sentences: [number, number, number][];
}

export interface ReadingState {
  book_id: string;
  chapter_index: number;
  chunk_index: number;
  sentence_index: number;
  char_offset: number;
  page: number;
  status: ReadingStatus;
  updated_at: string;
}

export type Intent = "RESUME" | "STOP" | "START" | "RESTART" | "REPEAT" | "QUESTION" | "EMPTY";
export interface ConverseResult { intent: Intent; answer: string | null; state: ReadingState }
export interface Turn { role: "user" | "assistant"; text: string; chunk_index: number | null; created_at: string }

export interface ProviderInfo { id: string; label: string; kind: "cloud" | "local"; model: string; configured: boolean; detail: string }
export interface SpeechInfo { id: string; label: string; configured: boolean; stt_model: string; tts_model: string; detail: string }
export interface Providers {
  llm: { active: string; providers: ProviderInfo[] };
  speech: {
    active: string;
    server_speech_available: boolean;
    tts_available: boolean;
    stt_available: boolean;
    tts_detail: string;
    stt_detail: string;
    providers: SpeechInfo[];
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch { /* not JSON */ }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  listBooks: () => request<Book[]>("/api/books"),
  getBook: (id: string) => request<BookDetail>(`/api/books/${id}`),
  uploadBook: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Book>("/api/books", { method: "POST", body: form });
  },
  renameBook: (id: string, title: string) => request<Book>(`/api/books/${id}`, json("PATCH", { title })),
  deleteBook: (id: string) => request<void>(`/api/books/${id}`, { method: "DELETE" }),
  getChunks: (id: string, start: number, limit = 5) => request<Chunk[]>(`/api/books/${id}/chunks?start=${start}&limit=${limit}`),

  getState: (id: string) => request<ReadingState>(`/api/books/${id}/state`),
  setPosition: (id: string, pos: { chunk_index: number; sentence_index?: number; char_offset?: number; status?: ReadingStatus }) =>
    request<ReadingState>(`/api/books/${id}/state`, json("PUT", pos)),
  setStatus: (id: string, status: ReadingStatus) => request<ReadingState>(`/api/books/${id}/state/status`, json("POST", { status })),
  interrupt: (id: string, chunk_index: number, char_offset: number) =>
    request<ReadingState>(`/api/books/${id}/state/interrupt`, json("POST", { chunk_index, char_offset })),
  resume: (id: string) => request<ReadingState>(`/api/books/${id}/state/resume`, json("POST")),

  converse: (id: string, text: string) => request<ConverseResult>(`/api/books/${id}/converse`, json("POST", { text })),
  conversation: (id: string) => request<Turn[]>(`/api/books/${id}/conversation`),
  clearConversation: (id: string) => request<void>(`/api/books/${id}/conversation`, { method: "DELETE" }),

  about: () => request<{ name: string; version: string; license: string; source_url: string }>("/api/about"),
  providers: () => request<Providers>("/api/providers"),
  setProviders: (body: { llm_provider?: string; speech_provider?: string }) => request<Providers>("/api/providers", json("PUT", body)),

  tts: (text: string, opts: { voice?: string; style?: SpeechStyle; persona?: string } = {}, signal?: AbortSignal) =>
    request<Blob>("/api/tts", { ...json("POST", { text, ...opts }), signal }),
  stt: (audio: Blob, signal?: AbortSignal) => {
    const form = new FormData();
    const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", audio, `speech.${ext}`);
    return request<{ text: string }>("/api/stt", { method: "POST", body: form, signal });
  },
};
