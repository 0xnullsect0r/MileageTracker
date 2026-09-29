import { getSessionUser } from "@/lib/auth";
import { getAttachment, readAttachment } from "@/lib/uploads";

/** Every file goes through here, behind the session check — never a static path. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const a = await getAttachment(id);
  if (!a) return new Response("Not found.", { status: 404 });

  const thumb = new URL(req.url).searchParams.get("thumb") === "1";
  let file: { body: Buffer; mime: string };
  try {
    file = await readAttachment(a, thumb);
  } catch {
    return new Response("The file is missing from storage.", { status: 410 });
  }
  const name = a.filename.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.body.length),
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
      // A PDF renders in the browser's viewer; nothing in it may script.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
