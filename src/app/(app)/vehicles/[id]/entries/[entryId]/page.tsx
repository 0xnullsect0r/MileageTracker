import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { AttachmentList } from "@/components/AttachmentList";
import { CategoryMark, categoryBorder } from "@/components/Category";
import { Num, Reading } from "@/components/Reading";
import { Label, Rule } from "@/components/ui";
import { db } from "@/db";
import { categories, entries, entryAttachments } from "@/db/schema";
import { getVehicle, unitsOf } from "@/lib/data";
import { formatReading, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const [entry] = await db
    .select({ e: entries, c: categories })
    .from(entries)
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .where(and(eq(entries.id, entryId), eq(entries.vehicleId, id), isNull(entries.deletedAt)))
    .limit(1);
  if (!entry) notFound();

  const files = await db
    .select()
    .from(entryAttachments)
    .where(eq(entryAttachments.entryId, entryId))
    .orderBy(asc(entryAttachments.createdAt));

  const units = unitsOf(vehicle);
  const e = entry.e;
  const c = entry.c;

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>{vehicle.name}</Label>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-tight">Entry</h1>
        </div>
        <Link
          href={`/vehicles/${id}/entries`}
          className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink"
        >
          Back to log
        </Link>
      </div>

      <Rule className="mt-6" />

      <section
        className="mt-6 grid gap-x-8 gap-y-4 border-l-[3px] pl-4 sm:grid-cols-2"
        style={categoryBorder(c)}
      >
        <div>
          <Label>Date</Label>
          <p className="num mt-1 text-lg">{e.occurredOn}</p>
        </div>
        <div>
          <Label>Reading</Label>
          <div className="mt-1">
            <Reading ticks={e.readingTicks} units={units} size="lg" withUnit />
          </div>
        </div>
        <div>
          <Label>Category</Label>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <CategoryMark category={c} />
            {c?.name ?? "—"}
          </p>
        </div>
        <div>
          <Label>Description</Label>
          <p className="mt-1 text-sm">{e.description ?? <span className="text-ink-muted">—</span>}</p>
        </div>
        {(e.fuelQty || e.fuelPricePerUnit || e.cost) && (
          <>
            <div>
              <Label>Fuel</Label>
              <p className="num mt-1 text-sm">
                {e.fuelQty ?? "—"}
                {e.fuelPricePerUnit ? <> · ${Number(e.fuelPricePerUnit).toFixed(3)}/{unitLabel(units) === "h" ? "unit" : "gal"}</> : null}
              </p>
            </div>
            <div>
              <Label>Cost</Label>
              <p className="mt-1"><Num value={e.cost ? Number(e.cost) : null} prefix="$" /></p>
            </div>
          </>
        )}
        {e.vendor && (
          <div>
            <Label>Vendor</Label>
            <p className="mt-1 text-sm">{e.vendor}</p>
          </div>
        )}
        {e.notes && (
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <p className="mt-1 whitespace-pre-wrap text-sm">{e.notes}</p>
          </div>
        )}
        {e.needsReview && (
          <div className="sm:col-span-2">
            <Label>Needs review</Label>
            <p className="mt-1 text-sm" style={{ color: "var(--signal)" }}>
              {e.reviewReason ?? "Flagged during import."}
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <Label>Receipts and attachments</Label>
        <AttachmentList
          entryId={entryId}
          files={files.map((f) => ({
            id: f.id,
            filename: f.filename,
            mime: f.mime,
            size: f.size,
            createdAt: f.createdAt.toISOString(),
          }))}
        />
      </section>
    </main>
  );
}
