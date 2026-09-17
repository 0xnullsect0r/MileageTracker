"use server";

import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, entries, entryAttachments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import {
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  newAttachmentId,
  persistAttachment,
  sanitiseFilename,
  sniffMagic,
  storagePathFor,
  uploadRoot,
} from "@/lib/attachments";

export interface UploadState {
  error?: string;
  ok?: boolean;
}

export async function attachFile(_prev: UploadState, form: FormData): Promise<UploadState> {
  const user = await requireUser();
  await assertSameOrigin();

  const entryId = String(form.get("entryId") ?? "").trim();
  if (!entryId) return { error: "Entry is required." };

  const [entry] = await db
    .select({ vehicleId: entries.vehicleId })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  if (!entry) return { error: "Entry not found." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: `That file is over the ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB limit.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) {
    // Body cut short or lied about its declared length.
    return { error: "Upload did not complete." };
  }

  let sniff;
  try {
    sniff = sniffMagic(bytes);
  } catch (e) {
    return { error: e instanceof AttachmentError ? e.message : "That file type is not accepted." };
  }

  const id = newAttachmentId();
  const storagePath = storagePathFor(id, sniff.ext);
  await persistAttachment(bytes, storagePath);

  await db.insert(entryAttachments).values({
    id,
    entryId,
    filename: sanitiseFilename(file.name),
    mime: sniff.mime,
    size: bytes.length,
    storagePath,
  });

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "attachment.create",
    targetType: "attachment",
    targetId: id,
    meta: { entryId, mime: sniff.mime, size: bytes.length },
  });

  revalidatePath(`/vehicles/${entry.vehicleId}/entries`);
  revalidatePath(`/vehicles/${entry.vehicleId}/service`);
  revalidatePath(`/vehicles/${entry.vehicleId}/fuel`);
  return { ok: true };
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const user = await requireUser();
  await assertSameOrigin();

  const [row] = await db
    .select({
      storagePath: entryAttachments.storagePath,
      entryId: entryAttachments.entryId,
    })
    .from(entryAttachments)
    .where(eq(entryAttachments.id, attachmentId))
    .limit(1);
  if (!row) return;

  const [entry] = await db
    .select({ vehicleId: entries.vehicleId })
    .from(entries)
    .where(eq(entries.id, row.entryId))
    .limit(1);

  await db.delete(entryAttachments).where(eq(entryAttachments.id, attachmentId));
  try {
    await unlink(join(uploadRoot(), row.storagePath));
  } catch {
    // Missing file is fine on delete — the DB row is the source of truth.
  }

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "attachment.delete",
    targetType: "attachment",
    targetId: attachmentId,
  });

  if (entry) {
    revalidatePath(`/vehicles/${entry.vehicleId}/entries`);
    revalidatePath(`/vehicles/${entry.vehicleId}/service`);
    revalidatePath(`/vehicles/${entry.vehicleId}/fuel`);
  }
}
