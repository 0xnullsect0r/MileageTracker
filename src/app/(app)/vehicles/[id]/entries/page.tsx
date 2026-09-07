import Link from "next/link";
import { notFound } from "next/navigation";
import { Climb } from "@/components/Climb";
import { EntriesTable, type TableRow } from "@/components/EntriesTable";
import { Reading } from "@/components/Reading";
import { Button, Label, Rule } from "@/components/ui";
import { getVehicle, listCategories, loadLog, unitsOf } from "@/lib/data";
import { fillGroups, withDistances } from "@/lib/derive";

export const dynamic = "force-dynamic";

export default async function EntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { id } = await params;
  const { review } = await searchParams;
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

  const current = [...log].reverse().find((e) => e.readingTicks !== null) ?? null;

  return (
    // Full-bleed: the one screen allowed to break the container, because
    // more visible rows is the feature.
    <main className="px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>{vehicle.name}</Label>
          <div className="mt-1">
            <Reading ticks={current?.readingTicks ?? null} units={units} size="lg" withUnit />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href={`/vehicles/${id}/fuel`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Fuel</Link>
          <Link href={`/vehicles/${id}/service`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Service</Link>
          <Link href={`/vehicles/${id}/settings`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Settings</Link>
          <Link href={`/vehicles/${id}/entries/new`}><Button variant="primary">Add entry</Button></Link>
        </div>
      </div>

      {/* The Climb, as a scrubber over the log it belongs to. */}
      <div className="mt-6">
        <Climb entries={log} units={units} height={40} />
      </div>

      <Rule className="mt-6" />

      <EntriesTable
        rows={rows}
        units={units}
        categories={cats.map((c) => ({ code: c.code, name: c.name, kind: c.kind }))}
        initialReviewOnly={review === "1"}
      />
    </main>
  );
}
