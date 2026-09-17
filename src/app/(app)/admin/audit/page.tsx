import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, ilike, lt, sql as raw } from "drizzle-orm";
import { Label, Rule } from "@/components/ui";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

/**
 * Read-only audit viewer. Paginated server-side — audit rows grow forever
 * and the entries log's whole-log approach would be wrong here.
 *
 * Filters compose in the WHERE clause; the URL is the state, so a stapled
 * link stays valid.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    since?: string;
    until?: string;
    page?: string;
  }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  const q = await searchParams;
  const page = Math.max(1, Number(q.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [] as ReturnType<typeof eq>[];
  if (q.action) conditions.push(ilike(auditLog.action, `%${q.action}%`));
  if (q.actor) conditions.push(eq(auditLog.actorUserId, q.actor));
  if (q.since && /^\d{4}-\d{2}-\d{2}$/.test(q.since)) {
    conditions.push(gte(auditLog.createdAt, new Date(`${q.since}T00:00:00Z`)));
  }
  if (q.until && /^\d{4}-\d{2}-\d{2}$/.test(q.until)) {
    const t = new Date(`${q.until}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1); // inclusive end
    conditions.push(lt(auditLog.createdAt, t));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, actors, countRows] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(Math.min(PAGE_SIZE, MAX_PAGE_SIZE))
      .offset(offset),
    db.select({ id: users.id, email: users.email, name: users.name }).from(users),
    db.select({ n: raw<number>`count(*)::int` }).from(auditLog).where(where),
  ]);

  const total = countRows[0]?.n ?? 0;
  const actorById = new Map(actors.map((u) => [u.id, u]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const preserved = new URLSearchParams();
  if (q.action) preserved.set("action", q.action);
  if (q.actor) preserved.set("actor", q.actor);
  if (q.since) preserved.set("since", q.since);
  if (q.until) preserved.set("until", q.until);

  const pageLink = (n: number) => {
    const s = new URLSearchParams(preserved);
    s.set("page", String(n));
    return `/admin/audit?${s.toString()}`;
  };

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Audit log</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Every mutation the app makes is recorded here. Read-only.
      </p>

      <Rule className="mt-6" />

      <form className="mt-6 grid gap-4 sm:grid-cols-5" method="get">
        <FilterField label="Action" name="action" placeholder="e.g. reminder.create" defaultValue={q.action ?? ""} />
        <FilterField label="Since" name="since" type="date" defaultValue={q.since ?? ""} />
        <FilterField label="Until" name="until" type="date" defaultValue={q.until ?? ""} />
        <label className="block">
          <Label>Actor</Label>
          <select
            name="actor"
            defaultValue={q.actor ?? ""}
            className="mt-1 w-full min-h-11 border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink focus:border-signal focus:outline-none"
          >
            <option value="">Anyone</option>
            {actors.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-4">
          <button type="submit" className="min-h-11 border border-ink px-4 text-sm font-semibold hover:bg-ink hover:text-paper">
            Filter
          </button>
          <Link href="/admin/audit" className="min-h-11 pt-3 text-sm text-ink-muted hover:text-ink">
            Clear
          </Link>
        </div>
      </form>

      <Rule className="mt-6" />

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">No matching audit rows.</p>
      ) : (
        <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[48rem] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-rule text-left text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                <th className="py-2 font-semibold">When</th>
                <th className="py-2 font-semibold">Actor</th>
                <th className="py-2 font-semibold">Action</th>
                <th className="py-2 font-semibold">Target</th>
                <th className="py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const actor = r.actorUserId ? actorById.get(r.actorUserId) : null;
                return (
                  <tr key={r.id} className="border-b border-rule align-top">
                    <td className="num py-1.5 pr-4 whitespace-nowrap">
                      {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-1.5 pr-4">
                      {actor ? actor.name : <span className="text-ink-muted">system</span>}
                    </td>
                    <td className="num py-1.5 pr-4">{r.action}</td>
                    <td className="num py-1.5 pr-4 text-ink-muted">
                      {r.targetType}
                      {r.targetId && <> · <span className="truncate">{r.targetId.slice(0, 8)}</span></>}
                    </td>
                    <td className="py-1.5 text-ink-muted">
                      {r.meta ? (
                        <code className="whitespace-pre-wrap break-all text-[0.75rem]">
                          {JSON.stringify(r.meta)}
                        </code>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="num text-ink-muted">
            Page {page} of {pages} · {total.toLocaleString()} rows
          </span>
          <div className="flex gap-4">
            {page > 1 && (
              <Link href={pageLink(page - 1)} className="min-h-11 pt-3 text-ink-muted hover:text-ink">
                ← Newer
              </Link>
            )}
            {page < pages && (
              <Link href={pageLink(page + 1)} className="min-h-11 pt-3 text-ink-muted hover:text-ink">
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function FilterField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full min-h-11 border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink focus:border-signal focus:outline-none placeholder:text-ink-muted"
      />
    </label>
  );
}
