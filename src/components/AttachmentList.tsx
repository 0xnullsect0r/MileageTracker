"use client";

import { useActionState, useTransition } from "react";
import { Button, Field, Label, inputClass } from "@/components/ui";
import {
  type UploadState,
  attachFile,
  deleteAttachment,
} from "@/app/(app)/attachments/actions";

const initial: UploadState = {};

export interface AttachmentSummary {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}

export function AttachmentList({
  entryId,
  files,
}: {
  entryId: string;
  files: AttachmentSummary[];
}) {
  const [state, action, pending] = useActionState(attachFile, initial);

  return (
    <div className="mt-3">
      {files.length === 0 ? (
        <p className="text-sm text-ink-muted">No receipts attached yet.</p>
      ) : (
        <ul className="max-w-2xl">
          {files.map((f) => (
            <AttachmentRow key={f.id} file={f} />
          ))}
        </ul>
      )}

      <form
        action={action}
        encType="multipart/form-data"
        className="mt-6 max-w-2xl border-t border-rule pt-6"
      >
        <input type="hidden" name="entryId" value={entryId} />
        <Field label="Add a receipt" hint="JPEG, PNG, WebP, or PDF. Up to 10 MB.">
          <input
            name="file"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className={inputClass}
          />
        </Field>
        {state.error && (
          <p className="mt-2 text-sm font-semibold" style={{ color: "var(--signal)" }}>
            {state.error}
          </p>
        )}
        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Uploading…" : "Attach"}
          </Button>
          {state.ok && !state.error && (
            <span className="text-sm text-ink-muted">Attached.</span>
          )}
        </div>
      </form>
    </div>
  );
}

function AttachmentRow({ file }: { file: AttachmentSummary }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-3">
      <a
        href={`/attachments/${file.id}`}
        target="_blank"
        rel="noopener"
        className="min-w-0 flex-1 truncate text-sm hover:text-signal"
      >
        {file.filename}
      </a>
      <span className="num shrink-0 text-[0.75rem] text-ink-muted">
        {formatBytes(file.size)}
      </span>
      <span className="num shrink-0 text-[0.75rem] text-ink-muted">
        {file.createdAt.slice(0, 10)}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm(`Delete "${file.filename}"?`)) {
            start(() => deleteAttachment(file.id));
          }
        }}
        className="min-h-8 shrink-0 text-[0.75rem] text-ink-muted hover:text-signal disabled:opacity-50"
      >
        Delete
      </button>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
