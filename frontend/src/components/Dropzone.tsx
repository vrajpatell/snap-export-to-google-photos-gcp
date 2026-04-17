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
    return "Please select a .zip file exported from Snapchat.";
  }
  if (file.size <= 0) return "That file appears to be empty.";
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
          "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ease-swift",
          dragActive
            ? "border-brand-500 bg-brand-50/70 shadow-lift dark:bg-brand-500/10"
            : "border-border bg-surface/60 hover:border-brand-400 hover:bg-surface",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <div
          className={cn(
            "grid h-12 w-12 place-items-center rounded-2xl transition-colors duration-200",
            dragActive
              ? "bg-brand-600 text-white"
              : "bg-brand-50 text-brand-600 group-hover:bg-brand-100 dark:text-brand-300",
          )}
        >
          <IconUpload className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">
            {dragActive ? "Drop to select" : "Drop your Snapchat export ZIP"}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            or <span className="text-brand-600 dark:text-brand-300">click to browse</span>
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
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {file ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:text-brand-300">
              <IconFile className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {file.name}
              </p>
              <p className="text-xs text-ink-muted tabular">
                {formatBytes(file.size)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="Remove file"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
