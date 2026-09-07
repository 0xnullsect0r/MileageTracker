import { sql } from "@/db";

export const dynamic = "force-dynamic";

/** Compose healthcheck. Reports the database too — a running Next.js
 *  process that cannot reach Postgres is not actually healthy. */
export async function GET() {
  try {
    await sql`select 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
