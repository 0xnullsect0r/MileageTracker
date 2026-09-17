import { sql } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Composed healthcheck.
 *
 * The default shape reports the DB — a running Next.js process that cannot
 * reach Postgres is not actually healthy. Passing ?deep=1 also checks the
 * parser sidecar and reports the current migration head, which the docker
 * healthcheck deliberately does not because it should not fail from a slow
 * parser boot.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";

  const state: {
    status: "ok" | "degraded";
    db: "ok" | "unreachable";
    parser?: "ok" | "unreachable";
    migrationHead?: string | null;
  } = { status: "ok", db: "ok" };

  try {
    await sql`select 1`;
  } catch {
    state.status = "degraded";
    state.db = "unreachable";
  }

  if (deep) {
    if (state.db === "ok") {
      try {
        const rows = await sql`
          select "hash" from drizzle.__drizzle_migrations
          order by created_at desc limit 1
        ` as unknown as Array<{ hash: string }>;
        state.migrationHead = rows[0]?.hash ?? null;
      } catch {
        state.migrationHead = null;
      }
    }

    const parserUrl = process.env.PARSER_URL;
    if (parserUrl) {
      try {
        const r = await fetch(`${parserUrl.replace(/\/+$/, "")}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        state.parser = r.ok ? "ok" : "unreachable";
      } catch {
        state.parser = "unreachable";
      }
      if (state.parser === "unreachable") state.status = "degraded";
    }
  }

  return Response.json(state, { status: state.status === "ok" ? 200 : 503 });
}
