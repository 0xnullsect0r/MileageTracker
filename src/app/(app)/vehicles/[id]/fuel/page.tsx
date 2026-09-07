import Link from "next/link";
import { notFound } from "next/navigation";
import { EconomyChart, type EconomyPoint } from "@/components/EconomyChart";
import { Num } from "@/components/Reading";
import { Label, Rule, Stat } from "@/components/ui";
import { getVehicle, loadLog, unitsOf } from "@/lib/data";
import { fillGroups, withDistances } from "@/lib/derive";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function FuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const units = unitsOf(vehicle);
  const log = await loadLog(id);
  const groups = fillGroups(withDistances(log));
  const usable = groups.filter((g) => !g.excluded);

  const points: EconomyPoint[] = groups.map((g) => ({
    date: g.closedBy.occurredOn,
    economy: g.economyTicksPerUnit === null ? null : Number(ticksToUnits(g.economyTicksPerUnit, units).toFixed(2)),
    pricePerUnit: g.fuelQty > 0 ? Number((g.cost / g.fuelQty).toFixed(3)) : null,
    merged: g.fills.length,
  }));

  const economies = usable.map((g) => ticksToUnits(g.economyTicksPerUnit!, units)).sort((a, b) => a - b);
  const best = economies.at(-1) ?? null;
  const worst = economies[0] ?? null;
  const totalDistance = usable.reduce((a, g) => a + g.distanceTicks, 0);
  const totalFuel = usable.reduce((a, g) => a + g.fuelQty, 0);
  const totalSpend = groups.reduce((a, g) => a + g.cost, 0);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>{vehicle.name}</Label>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-tight">Fuel</h1>
        </div>
        <div className="flex gap-5">
          <Link href={`/vehicles/${id}/entries`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Log</Link>
          <Link href={`/vehicles/${id}/service`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Service</Link>
        </div>
      </div>

      <Rule className="mt-6" />

      <EconomyChart data={points} unit={unitLabel(units)} />

      <div className="mt-8 grid grid-cols-2 gap-6 border-t border-rule pt-6 sm:grid-cols-5">
        <Stat label="Overall">
          <span className="num text-[1.5rem]">
            {totalFuel > 0 ? ticksToUnits(totalDistance / totalFuel, units).toFixed(1) : "—"}
          </span>
          <span className="ml-1 text-sm text-ink-muted">{unitLabel(units)}/gal</span>
        </Stat>
        <Stat label="Best tank"><span className="num text-[1.5rem]">{best?.toFixed(1) ?? "—"}</span></Stat>
        <Stat label="Worst tank"><span className="num text-[1.5rem]">{worst?.toFixed(1) ?? "—"}</span></Stat>
        <Stat label="Total spend"><Num value={totalSpend} prefix="$" className="text-[1.5rem]" /></Stat>
        <Stat label="Fill-ups"><span className="num text-[1.5rem]">{log.filter((e) => e.category?.kind === "FUEL").length}</span></Stat>
      </div>

      <section className="mt-10">
        <Label>Every tank</Label>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          A tank runs from one full fill-up to the next. A partial fill is folded into the tank
          it belongs to, which is why these figures are steadier than the per-receipt numbers in
          the spreadsheet.
        </p>
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[38rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              <th className="py-2 font-semibold">Closed</th>
              <th className="py-2 text-right font-semibold">Distance</th>
              <th className="py-2 text-right font-semibold">Fuel</th>
              <th className="py-2 text-right font-semibold">Cost</th>
              <th className="py-2 text-right font-semibold">{unitLabel(units)}/gal</th>
              <th className="py-2 pl-4 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[...groups].reverse().slice(0, 200).map((g, i) => (
              <tr key={`${g.closedBy.id}`} className={`border-b border-rule ${(i + 1) % 5 === 0 ? "border-b-[1.5px]" : ""}`}>
                <td className="num py-1.5">{g.closedBy.occurredOn}</td>
                <td className="num py-1.5 text-right">{formatReading(g.distanceTicks, units)}</td>
                <td className="num py-1.5 text-right">{g.fuelQty.toFixed(3)}</td>
                <td className="num py-1.5 text-right">${g.cost.toFixed(2)}</td>
                <td className="num py-1.5 text-right">
                  {g.economyTicksPerUnit === null ? (
                    <span className="text-ink-muted">—</span>
                  ) : (
                    <span className="computed px-1">{ticksToUnits(g.economyTicksPerUnit, units).toFixed(1)}</span>
                  )}
                </td>
                <td className="py-1.5 pl-4 text-ink-muted">
                  {g.excludedReason ??
                    (g.fills.length > 1 ? `${g.fills.length} fill-ups in this tank` : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
