"use client";

import { useState } from "react";
import { PaperclipIcon } from "@/components/nav/icons";
import { Label } from "@/components/ui";

export interface AttachmentView {
  id: string;
  filename: string;
  mime: string;
}

/** A file picker that opens the camera on a phone. */
export function AttachmentInput({ name = "file", label = "Receipt or photo" }: { name?: string; label?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
      <Label>{label}</Label>
      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 border-b border-rule py-2 text-sm text-ink-muted hover:text-ink focus-within:border-signal">
        <PaperclipIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{picked ?? "Take a photo or choose a file"}</span>
        <input
          type="file"
          name={name}
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
        />
      </label>
    </div>
  );
}

/** Thumbnails for images, a named link for PDFs. */
export function AttachmentList({ items, onRemove }: { items: AttachmentView[]; onRemove?: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <a
            href={`/attachments/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center gap-2 border border-rule px-1 text-[0.8125rem] text-ink-muted hover:border-ink hover:text-ink"
            title={a.filename}
          >
            {a.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- auth-gated route
              <img src={`/attachments/${a.id}`} alt={a.filename} className="size-12 object-cover" loading="lazy" />
            ) : (
              <span className="flex h-12 items-center gap-1 px-2">
                <PaperclipIcon className="size-4" />
                <span className="max-w-[10rem] truncate">{a.filename}</span>
              </span>
            )}
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              className="mt-1 block min-h-8 w-full text-center text-[0.75rem] text-ink-muted hover:text-signal"
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
