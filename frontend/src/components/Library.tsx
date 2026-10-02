import { motion } from "motion/react";
import { BookOpen, FileUp, Loader2, Pencil, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Book } from "../api/client";
import { BookCover } from "./BookCover";
import { EditableTitle } from "./EditableTitle";

interface Props {
  onOpen: (id: string) => void;
  onOpenSettings: () => void;
  notify: (message: string, tone?: "info" | "error") => void;
}

const STATUS_LABEL: Record<string, string> = {
  IDLE: "Not started", READING: "In progress", LISTENING: "In progress", ANSWERING: "In progress",
  RESUMING: "In progress", PAUSED: "In progress", FINISHED: "Finished",
};

export function Library({ onOpen, onOpenSettings, notify }: Props) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    api.listBooks().then(setBooks).catch((e) => { setBooks([]); notify(`Backend unreachable: ${e.message}`, "error"); });
  }, [notify]);
  useEffect(refresh, [refresh]);

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) { notify("Please choose a PDF file.", "error"); return; }
    setUploading(file.name);
    try {
      const book = await api.uploadBook(file);
      notify(`“${book.title}” is ready — ${book.page_count} pages.`);
      refresh();
      onOpen(book.id);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setUploading(null);
    }
  };

  const rename = async (book: Book, title: string) => {
    try {
      const updated = await api.renameBook(book.id, title);
      setBooks((list) => list?.map((b) => (b.id === book.id ? { ...b, title: updated.title } : b)) ?? list);
    } catch (e) {
      notify((e as Error).message, "error");
      throw e;
    }
  };

  const remove = async (book: Book) => {
    if (!window.confirm(`Remove “${book.title}” and its reading history from this device?`)) return;
    await api.deleteBook(book.id).catch((e) => notify(e.message, "error"));
    refresh();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 pb-16 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-md"><BookOpen className="size-4.5" /></div>
          <div>
            <div className="reading-text text-xl font-semibold tracking-tight">Lectern</div>
            <div className="text-xs text-ink-3">Your books, read aloud. Ask anything, anytime.</div>
          </div>
        </div>
        <button onClick={onOpenSettings} className="flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm text-ink-2 hover:text-ink">
          <Settings2 className="size-4" /> Settings
        </button>
      </header>

      <motion.label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
        animate={{ scale: dragging ? 1.01 : 1 }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-card/60 hover:border-ink-3"
        }`}
      >
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        {uploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-accent" />
            <div className="text-sm text-ink-2">Preparing <span className="font-medium text-ink">{uploading}</span> — extracting text and chapters…</div>
          </>
        ) : (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><FileUp className="size-6" /></div>
            <div>
              <div className="reading-text text-lg font-medium">Drop a PDF book here</div>
              <div className="mt-1 text-sm text-ink-3">or click to choose a file · stays on this machine</div>
            </div>
          </>
        )}
      </motion.label>

      <section className="mt-12">
        <h2 className="mb-5 text-xs font-semibold tracking-[0.18em] text-ink-3 uppercase">Library</h2>
        {books === null ? (
          <div className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : books.length === 0 ? (
          <p className="text-sm text-ink-3">No books yet. Upload a PDF to begin.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {books.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="group relative">
                <button onClick={() => renaming !== b.id && onOpen(b.id)} className="block w-full text-left">
                  <BookCover title={b.title} seed={b.id} className="aspect-[2/3] w-full transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:rotate-[-0.6deg]" />
                </button>
                <div className="mt-3 flex min-h-6 items-center text-sm font-medium" onDoubleClick={() => setRenaming(b.id)} title="Double-click to rename">
                  <EditableTitle value={b.title} editing={renaming === b.id} onEditingChange={(on) => setRenaming(on ? b.id : null)}
                    onSave={(t) => rename(b, t)} className="line-clamp-1 cursor-text" inputClassName="text-sm" />
                </div>
                <button onClick={() => renaming !== b.id && onOpen(b.id)} className="block w-full text-left" tabIndex={-1}>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
                    <span>{STATUS_LABEL[b.status] ?? ""}</span><span>{b.page_count} pp</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                  </div>
                </button>
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button onClick={() => setRenaming(b.id)} aria-label={`Rename ${b.title}`} title="Rename"
                    className="rounded-full bg-black/35 p-1.5 text-white backdrop-blur hover:bg-black/55">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => remove(b)} aria-label={`Delete ${b.title}`} title="Delete"
                    className="rounded-full bg-black/35 p-1.5 text-white backdrop-blur hover:bg-black/55">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
