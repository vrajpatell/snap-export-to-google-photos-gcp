import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconFile, IconUpload, IconX } from "@/components/ui/icons";
import { formatBytes } from "@/lib/format";

const ACCEPTED_EXT = [".zip"];
const ACCEPTED_MIME = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

export interface DropzoneProps {
  file: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  hint?: string;
}

function validate(file: File): string | null {
  const hasExt = ACCEPTED_EXT.some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  );
  if (!hasExt && !ACCEPTED_MIME.has(file.type)) {
    return "Choose your Snapchat ZIP export.";
  }
  if (file.size <= 0) return "That file looks empty.";
  return null;
}

export function Dropzone({ file, onSelect, disabled, hint }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const picked = files[0];
      const err = validate(picked);
      if (err) {
        setError(err);
        onSelect(null);
        return;
      }
      setError(null);
      onSelect(picked);
    },
    [onSelect],
  );

  return (
    <div>
      <label
        htmlFor="snap-zip-input"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[1.9rem] border border-dashed px-6 py-12 text-center transition-all duration-300 ease-swift",
          "before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_0%,rgb(45_212_191_/_0.22),transparent_42%),linear-gradient(135deg,rgb(99_102_241_/_0.12),transparent)] before:opacity-0 before:transition-opacity before:duration-300",
          dragActive
            ? "scale-[1.01] border-brand-400 bg-brand-50/90 shadow-lift before:opacity-100 dark:bg-brand-500/10"
            : "border-border bg-white/54 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white/76 hover:shadow-lift dark:bg-white/5 dark:hover:bg-white/10",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <div
          className={cn(
            "relative z-10 grid h-16 w-16 place-items-center rounded-3xl transition-all duration-300",
            dragActive
              ? "scale-110 bg-brand-600 text-white shadow-lift"
              : "bg-gradient-to-br from-brand-50 via-white to-indigo-100 text-brand-600 shadow-soft group-hover:scale-105 dark:from-brand-500/20 dark:via-white/10 dark:to-indigo-500/20 dark:text-brand-300",
          )}
        >
          <IconUpload className="h-7 w-7" />
        </div>
        <div className="relative z-10">
          <p className="text-lg font-black tracking-tight text-ink sm:text-xl">
            {dragActive ? "Drop it here" : "Drop your Snapchat ZIP"}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            or <span className="font-bold text-brand-700 dark:text-brand-300">browse files</span>
            {hint ? ` · ${hint}` : ""}
          </p>
        </div>
        <input
          id="snap-zip-input"
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
      </label>

      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {file ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-white/65 bg-white/78 px-4 py-3 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <IconFile className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">
                {file.name}
              </p>
              <p className="text-xs text-ink-muted tabular">
                {formatBytes(file.size)} selected
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Remove file"
            className="rounded-xl p-2 text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
