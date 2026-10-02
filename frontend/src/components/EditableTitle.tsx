import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Persist the new title; reject to keep the editor open. */
  onSave: (title: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
}

/** Shows a title; when `editing`, turns into an input (Enter saves, Escape cancels). */
export function EditableTitle({ value, editing, onEditingChange, onSave, className = "", inputClassName = "" }: Props) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [editing, value]);

  const commit = async () => {
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title || title === value) { onEditingChange(false); return; }
    setSaving(true);
    try {
      await onSave(title);
      onEditingChange(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) return <span className={className}>{value}</span>;

  return (
    <span className="flex min-w-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        maxLength={200}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // keep Space/K/arrows from controlling playback while typing
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") onEditingChange(false);
        }}
        onBlur={() => { if (!saving) void commit(); }}
        aria-label="Book title"
        className={`min-w-0 flex-1 rounded-md border border-accent bg-card px-2 py-0.5 outline-none focus:ring-2 focus:ring-accent/30 ${inputClassName}`}
      />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void commit()}
        className="grid size-6 shrink-0 place-items-center rounded-md text-accent hover:bg-paper-2" aria-label="Save title">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      </button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onEditingChange(false)}
        className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-paper-2" aria-label="Cancel">
        <X className="size-3.5" />
      </button>
    </span>
  );
}
