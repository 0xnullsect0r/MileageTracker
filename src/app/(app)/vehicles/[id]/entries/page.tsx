import { notFound } from "next/navigation";
import { Climb } from "@/components/Climb";
import { EntriesTable, type TableRow } from "@/components/EntriesTable";
import { restoreEntry } from "@/app/(app)/vehicles/[id]/entries/actions";
import { Banner, Rule } from "@/components/ui";
import { getVehicle, listCategories, loadLog, unitsOf } from "@/lib/data";
import { fillGroups, withDistances } from "@/lib/derive";
import { parseView, viewToSearch } from "@/lib/log-view";

export const dynamic = "force-dynamic";

export default async function EntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const deleted = typeof query.deleted === "string" ? query.deleted : undefined;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const units = unitsOf(vehicle);
  const log = await loadLog(id);
  const cats = await listCategories(id);

  // Economy belongs to the fill that closed a group, so map it back.
  const groups = fillGroups(withDistances(log));
  const economyByEntry = new Map(groups.map((g) => [g.closedBy.id, g.economyTicksPerUnit]));

  const rows: TableRow[] = log.map((e) => ({
    id: e.id,
    occurredOn: e.occurredOn,
    readingTicks: e.readingTicks,
    distanceTicks: e.distanceTicks,
    description: e.description,
    categoryCode: e.category?.code ?? null,
    categoryName: e.category?.name ?? null,
    categoryKind: e.category?.kind ?? null,
    fuelQty: e.fuelQty,
    pricePerUnit: e.fuelPricePerUnit,
    cost: e.cost,
    economy: economyByEntry.get(e.id) ?? null,
    needsReview: e.needsReview,
    reviewReason: e.reviewReason,
    importOriginalValue: e.importOriginalValue,
  }));

  const view = parseView(query);

  return (
    // Full-bleed: the one screen allowed to break the container, because
    // more visible rows is the feature.
    <main className="px-4 pb-8 pt-4 sm:px-8">
      <h2 className="sr-only">Log</h2>
      {deleted && /^[0-9a-f-]{36}$/.test(deleted) && (
        <div className="mb-4" role="status">
          <Banner tone="quiet">
            <form action={restoreEntry} className="flex flex-wrap items-center gap-x-4">
              <span>Entry deleted.</span>
              <input type="hidden" name="id" value={deleted} />
              <input type="hidden" name="vehicleId" value={id} />
              <button type="submit" className="inline-flex min-h-11 items-center font-semibold underline">Undo</button>
            </form>
          </Banner>
        </div>
      )}
      {/* The Climb, as a scrubber over the log it belongs to. */}
      <div>
        <Climb entries={log} units={units} height={40} />
      </div>

      <Rule className="mt-6" />

      {/* Keyed by the view, so following a link to a different one (the
          nav's Log, the garage's review link) resets the table. */}
      <EntriesTable
        key={viewToSearch(view)}
        vehicleId={id}
        rows={rows}
        units={units}
        categories={cats.map((c) => ({ code: c.code, name: c.name, kind: c.kind }))}
        initialView={view}
      />
    </main>
  );
}
