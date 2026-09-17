import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Attachment safety.
 *
 * Uploaded files are receipts a driver takes at a pump. We accept a small
 * allowlist and refuse everything else — this is a personal logbook, not a
 * general-purpose file host, so we can be strict.
 *
 * Trust the magic bytes, not the browser-supplied MIME. A .pdf renamed to
 * .jpg still looks like a PDF on disk; a JS file renamed to .jpg does not.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MiB per file

const KINDS = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    // FF D8 FF — JPEG SOI + marker.
    match: (b: Buffer) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    // 89 50 4E 47 0D 0A 1A 0A
    match: (b: Buffer) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: "image/webp",
    ext: "webp",
    // RIFF....WEBP
    match: (b: Buffer) =>
      b.length >= 12 &&
      b.slice(0, 4).toString("ascii") === "RIFF" &&
      b.slice(8, 12).toString("ascii") === "WEBP",
  },
  {
    mime: "application/pdf",
    ext: "pdf",
    // %PDF-
    match: (b: Buffer) => b.length >= 5 && b.slice(0, 5).toString("ascii") === "%PDF-",
  },
] as const;

export interface SniffResult {
  mime: string;
  ext: string;
}

/** Returns the detected kind, or throws with a useful reason. */
export function sniffMagic(bytes: Buffer): SniffResult {
  for (const k of KINDS) {
    if (k.match(bytes)) return { mime: k.mime, ext: k.ext };
  }
  throw new AttachmentError(
    "Only JPEG, PNG, WebP and PDF are accepted. The file's contents did not match any of these.",
  );
}

export class AttachmentError extends Error {}

/**
 * Path under `uploads/`. Two shards on the SHA of the id keep any single
 * directory well below any filesystem's fanout limit even at 100k+ files.
 */
export function storagePathFor(id: string, ext: string): string {
  const digest = createHash("sha256").update(id).digest("hex");
  return join("attachments", digest.slice(0, 2), digest.slice(2, 4), `${id}.${ext}`);
}

export function uploadRoot(): string {
  return process.env.UPLOAD_ROOT ?? join(process.cwd(), "uploads");
}

/** Writes to disk under `uploads/<storagePath>`. Creates parent dirs. */
export async function persistAttachment(bytes: Buffer, storagePath: string): Promise<void> {
  const full = join(uploadRoot(), storagePath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, bytes, { mode: 0o640 });
}

export function newAttachmentId(): string {
  return randomUUID();
}

/**
 * "Downloadable receipt.pdf" — never trust the browser's filename; strip
 * path separators and control characters. Anything that would confuse a
 * shell or a filesystem is gone.
 */
export function sanitiseFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "attachment";
  const clean = base
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return clean.length > 0 ? clean.slice(0, 200) : "attachment";
}
