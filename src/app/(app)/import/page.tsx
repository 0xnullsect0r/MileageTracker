import Link from "next/link";
import { asc } from "drizzle-orm";
import { UploadForm } from "@/components/UploadForm";
import { Button, Label, Rule } from "@/components/ui";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listVehicles } from "@/lib/data";
import { listBatches, undoImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const [vehicles, committed, drafts] = await Promise.all([
    listVehicles(),
    listBatches(),
    db.select().from(importBatches).where(eq(importBatches.status, "DRAFT")).orderBy(asc(importBatches.createdAt)),
  ]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <h1 className="text-[2rem] font-semibold tracking-tight">Import</h1>
      <p className="mt-2 max-w-prose text-ink-muted">
        Upload an Apple Numbers file or a CSV. Nothing is written until you have looked at
        whatever it flags.
      </p>
      <Rule className="mt-6" />

      {vehicles.length === 0 ? (
        <p className="mt-8 text-ink-muted">
          <Link href="/vehicles/new" className="underline">Add a vehicle</Link> first, so the
          entries have somewhere to go.
        </p>
      ) : (
        <div className="mt-8">
          <UploadForm vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))} />
        </div>
      )}

      {drafts.length > 0 && (
        <section className="mt-12">
          <Label>In progress</Label>
          <div className="mt-3">
            {drafts.map((b) => (
              <div key={b.id} className="flex items-baseline justify-between gap-4 border-b border-rule py-3">
                <Link href={`/import/${b.id}`} className="text-sm underline">{b.filename}</Link>
                <span className="num text-[0.75rem] text-ink-muted">
                  {b.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {committed.length > 0 && (
        <section className="mt-12">
          <Label>Completed</Label>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {committed.map((b) => {
                const stats = (b.stats ?? {}) as Record<string, number>;
                return (
                  <tr key={b.id} className="border-b border-rule align-baseline">
                    <td className="py-3 pr-4">{b.filename}</td>
                    <td className="num py-3 pr-4 text-[0.8125rem] text-ink-muted">
                      {b.committedAt?.toISOString().slice(0, 10)}
                    </td>
                    <td className="num py-3 pr-4 text-right text-[0.8125rem] text-ink-muted">
                      {(stats.imported ?? 0).toLocaleString("en-US")} in ·{" "}
                      {(stats.skipped ?? 0).toLocaleString("en-US")} skipped
                    </td>
                    <td className="py-3 text-right">
                      <form action={undoImport}>
                        <input type="hidden" name="batchId" value={b.id} />
                        <Button type="submit" variant="danger">Undo this import</Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
