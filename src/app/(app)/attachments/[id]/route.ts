import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entryAttachments } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { uploadRoot } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/**
 * Streamed download for an attachment. Auth is enforced here — the uploads
 * volume is not published; the app is the only reader of these files, so
 * every download must pass through the app.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return new Response("Not signed in.", { status: 401 });
  const { id } = await params;

  const [row] = await db
    .select()
    .from(entryAttachments)
    .where(eq(entryAttachments.id, id))
    .limit(1);
  if (!row) return new Response("Not found.", { status: 404 });

  const full = join(uploadRoot(), row.storagePath);
  try {
    await stat(full);
  } catch {
    return new Response("File missing on disk.", { status: 410 });
  }

  const stream = createReadStream(full);
  const body = Readable.toWeb(stream) as unknown as ReadableStream;

  return new Response(body, {
    headers: {
      "content-type": row.mime,
      "content-length": String(row.size),
      // The MIME is set from the server-side sniff, not the client claim.
      // nosniff prevents a browser from second-guessing it and executing it
      // as HTML on a bad MIME (defence in depth; the allowlist forbids HTML).
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; object-src 'self'",
      // Attachment for anything that isn't an image the browser can render
      // inline safely.
      "content-disposition":
        row.mime.startsWith("image/") || row.mime === "application/pdf"
          ? `inline; filename="${row.filename.replace(/"/g, "")}"`
          : `attachment; filename="${row.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
