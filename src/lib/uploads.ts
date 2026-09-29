import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entryAttachments, type EntryAttachment } from "@/db/schema";

/**
 * Receipt photos, document scans and vehicle photos, on the `uploads`
 * volume. Files are named by a random id — never by what the uploader
 * called them — and served only through the auth-checked attachments route.
 */

const DIR = process.env.UPLOAD_DIR ?? "/app/uploads";
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? "32") * 1024 * 1024;
/** Phone photos arrive at 4–12 MB; this is plenty to read a receipt. */
const MAX_EDGE = 2000;
const THUMB = 160;

export type Owner = { entryId: string } | { documentId: string } | { vehicleId: string };

/** Trust the bytes, not the extension or the browser's claimed type. */
export function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  if (buf.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|mif1|msf1|hevc)$/.test(buf.toString("ascii", 8, 12))) {
    return "image/heic";
  }
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

function resolve(storagePath: string): string {
  // storagePath is always our own `<uuid>.<ext>`; refuse anything else.
  if (!/^[0-9a-f-]{36}(\.thumb)?\.[a-z]+$/.test(storagePath)) throw new Error("bad storage path");
  // Runtime data, not source: keep the standalone build from tracing it.
  return path.join(/* turbopackIgnore: true */ DIR, storagePath);
}

function thumbPath(storagePath: string): string {
  return storagePath.replace(/\.[a-z]+$/, ".thumb.jpg");
}

export async function saveUpload(
  file: File,
  owner: Owner,
  opts: { thumb?: boolean } = {},
): Promise<{ id: string } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: `Files are limited to ${MAX_BYTES / 1024 / 1024} MB.` };
  let buf: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = sniff(buf);
  if (!mime) return { error: "Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be attached." };

  await mkdir(/* turbopackIgnore: true */ DIR, { recursive: true });
  const id = randomUUID();
  let thumb: Buffer | null = null;

  if (mime !== "application/pdf") {
    try {
      const sharp = (await import("sharp")).default;
      if (mime !== "image/heic" || sharp.format.heif?.input?.file) {
        // .rotate() applies the EXIF orientation, so a sideways phone photo is upright.
        buf = await sharp(buf).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        mime = "image/jpeg";
        if (opts.thumb) thumb = await sharp(buf).resize(THUMB, THUMB, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
      }
    } catch {
      // Stored as uploaded if it cannot be processed; it is still a valid image.
    }
  }

  const storagePath = `${id}.${EXT[mime]}`;
  await writeFile(resolve(storagePath), buf);
  if (thumb) await writeFile(resolve(thumbPath(storagePath)), thumb);

  await db.insert(entryAttachments).values({
    id,
    ...owner,
    filename: file.name.slice(0, 200) || storagePath,
    mime,
    size: buf.length,
    storagePath,
  });
  return { id };
}

export async function getAttachment(id: string): Promise<EntryAttachment | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await db.select().from(entryAttachments).where(eq(entryAttachments.id, id)).limit(1))[0] ?? null;
}

export async function readAttachment(a: EntryAttachment, thumb = false): Promise<{ body: Buffer; mime: string }> {
  if (thumb) {
    try {
      return { body: await readFile(resolve(thumbPath(a.storagePath))), mime: "image/jpeg" };
    } catch {
      // No thumbnail: fall through to the full file.
    }
  }
  return { body: await readFile(resolve(a.storagePath)), mime: a.mime };
}

async function unlinkQuietly(storagePath: string) {
  await unlink(resolve(storagePath)).catch(() => {});
  await unlink(resolve(thumbPath(storagePath))).catch(() => {});
}

export async function removeAttachment(id: string): Promise<void> {
  const a = await getAttachment(id);
  if (!a) return;
  await db.delete(entryAttachments).where(eq(entryAttachments.id, id));
  await unlinkQuietly(a.storagePath);
}

export async function removeFilesFor(owner: Owner): Promise<void> {
  const col =
    "entryId" in owner
      ? eq(entryAttachments.entryId, owner.entryId)
      : "documentId" in owner
        ? eq(entryAttachments.documentId, owner.documentId)
        : eq(entryAttachments.vehicleId, owner.vehicleId);
  const rows = await db.delete(entryAttachments).where(col).returning();
  await Promise.all(rows.map((a) => unlinkQuietly(a.storagePath)));
}

export async function listAttachments(owner: Owner): Promise<EntryAttachment[]> {
  const col =
    "entryId" in owner
      ? eq(entryAttachments.entryId, owner.entryId)
      : "documentId" in owner
        ? eq(entryAttachments.documentId, owner.documentId)
        : eq(entryAttachments.vehicleId, owner.vehicleId);
  return db.select().from(entryAttachments).where(col);
}
