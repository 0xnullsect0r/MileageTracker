import Link from "next/link";
import { asc } from "drizzle-orm";
import { Num } from "@/components/Reading";
import { Label, Rule } from "@/components/ui";
import { db } from "@/db";
import { mileageRates } from "@/db/schema";
import { listVehicles, loadLog, unitsOf } from "@/lib/data";
import { summarise } from "@/lib/derive";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; vehicle?: string }>;
}) {
  const { year: yearParam, vehicle: vehicleParam } = await searchParams;
  const all = await listVehicles();
  if (all.length === 0) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8">
        <h1 className="text-[2rem] font-semibold tracking-tight">Reports</h1>
        <p className="mt-6 text-ink-muted">Add a vehicle first.</p>
      </main>
    );
  }

  const vehicle = all.find((v) => v.id === vehicleParam) ?? all[0]!;
  const units = unitsOf(vehicle);
  const log = await loadLog(vehicle.id);

  const years = [...new Set(log.map((e) => e.occurredOn.slice(0, 4)))].sort().reverse();
  const year = yearParam && years.includes(yearParam) ? yearParam : (years[0] ?? String(new Date().getFullYear()));

  const period = { from: `${year}-01-01`, to: `${year}-12-31` };
  const s = summarise(log, period);

  const rates = await db.select().from(mileageRates).orderBy(asc(mileageRates.year));
  const rate = rates.find((r) => r.year === Number(year));
  const businessUnits = ticksToUnits(s.businessDistanceTicks, units);
  const deduction = rate ? businessUnits * Number(rate.rateBusiness) : null;

  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const last = new Date(Number(year), i + 1, 0).getDate();
    const m = summarise(log, { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` });
    return { month: `${year}-${mm}`, ...m };
  });

  const total = s.businessDistanceTicks + s.personalDistanceTicks + s.unclassifiedDistanceTicks;
  const pct = (t: number) => (total === 0 ? 0 : (t / total) * 100);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 print:max-w-none print:px-0 print:py-0 sm:px-8">
      {/* Controls vanish on paper. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
        <h1 className="text-[2rem] font-semibold tracking-tight">Reports</h1>
        <div className="flex flex-wrap gap-1">
          {years.map((y) => (
            <Link
              key={y}
              href={`/reports?year=${y}&vehicle=${vehicle.id}`}
              className={`min-h-11 px-2 pt-3 text-sm ${y === year ? "border-b-2 border-signal font-semibold" : "border-b-2 border-transparent text-ink-muted hover:text-ink"}`}
            >
              {y}
            </Link>
          ))}
        </div>
        {all.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {all.map((v) => (
              <Link
                key={v.id}
                href={`/reports?year=${year}&vehicle=${v.id}`}
                className={`min-h-11 px-2 pt-3 text-sm ${v.id === vehicle.id ? "border-b-2 border-signal font-semibold" : "border-b-2 border-transparent text-ink-muted hover:text-ink"}`}
              >
                {v.name}
              </Link>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-3">
          <Label>Download</Label>
          <a
            href={`/reports/export?year=${year}&vehicle=${vehicle.id}`}
            className="min-h-11 text-sm text-ink-muted hover:text-ink"
          >
            {year}
          </a>
          <a
            href={`/reports/export?range=last-month&vehicle=${vehicle.id}`}
            className="min-h-11 text-sm text-ink-muted hover:text-ink"
          >
            Last month
          </a>
          {all.length > 1 && (
            <a
              href={`/reports/export?range=last-month&vehicle=all`}
              className="min-h-11 text-sm text-ink-muted hover:text-ink"
            >
              Last month · every vehicle
            </a>
          )}
        </div>
      </div>

      <Rule className="my-6 print:hidden" />

      {/* The document proper. */}
      <header className="print:pt-0">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-4">
          <div><Label>Vehicle</Label><p className="mt-1 text-sm">{vehicle.name}</p></div>
          <div><Label>Tax year</Label><p className="num mt-1 text-sm">{year}</p></div>
          <div>
            <Label>IRS rate</Label>
            <p className="num mt-1 text-sm">{rate ? `$${Number(rate.rateBusiness).toFixed(3)} / ${unitLabel(units)}` : "—"}</p>
          </div>
          <div><Label>Prepared</Label><p className="num mt-1 text-sm">{new Date().toISOString().slice(0, 10)}</p></div>
        </div>
      </header>

      <Rule strong className="my-6" />

      {/* Loudest thing on the page, and the reason it exists. */}
      <section>
        <Label>Estimated deduction</Label>
        <p className="num mt-2 inline-block border-b-2 pb-1 text-[2.5rem] leading-none tracking-tight" style={{ borderColor: "var(--signal)" }}>
          {deduction === null ? "—" : `$${deduction.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          <span className="num">{formatReading(s.businessDistanceTicks, units)}</span> business{" "}
          {unitLabel(units) === "h" ? "hours" : "miles"}
          {rate && <> × <span className="num">${Number(rate.rateBusiness).toFixed(3)}</span></>}
        </p>
      </section>

      <section className="mt-10">
        <Label>Business and personal</Label>
        {/* A proportion bar, not a pie: it prints, and the numbers sit on it. */}
        <div className="mt-3 flex h-6 w-full border border-rule print:border-ink">
          <Bar label="B" pct={pct(s.businessDistanceTicks)} token="business" />
          <Bar label="P" pct={pct(s.personalDistanceTicks)} token="personal" />
          <Bar label="I" pct={pct(s.unclassifiedDistanceTicks)} token="info" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fig label="Business" value={formatReading(s.businessDistanceTicks, units)} unit={unitLabel(units)} />
          <Fig label="Personal" value={formatReading(s.personalDistanceTicks, units)} unit={unitLabel(units)} />
          <Fig label="Unclassified" value={formatReading(s.unclassifiedDistanceTicks, units)} unit={unitLabel(units)} />
          <Fig label="Total" value={formatReading(total, units)} unit={unitLabel(units)} />
        </div>
      </section>

      <section className="mt-10">
        <Label>Costs</Label>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><Label>Fuel</Label><p className="mt-1"><Num value={s.fuelSpend} prefix="$" /></p></div>
          <div><Label>Service and other</Label><p className="mt-1"><Num value={s.serviceSpend} prefix="$" /></p></div>
          <div>
            <Label>Economy</Label>
            <p className="num mt-1">
              {s.aggregateEconomyTicksPerUnit === null ? "—" : `${ticksToUnits(s.aggregateEconomyTicksPerUnit, units).toFixed(1)} ${unitLabel(units)}/gal`}
            </p>
          </div>
          <div>
            <Label>Cost per {unitLabel(units)}</Label>
            <p className="num mt-1">{s.costPerTick === null ? "—" : `$${(s.costPerTick * (units.meterType === "HOURS" ? 60 : 100)).toFixed(3)}`}</p>
          </div>
        </div>
      </section>

      <section className="mt-10 break-inside-avoid">
        <Label>Month by month</Label>
        <div className="-mx-4 mt-3 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[30rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
              <th className="py-2 font-semibold">Month</th>
              <th className="py-2 text-right font-semibold">Business</th>
              <th className="py-2 text-right font-semibold">Personal</th>
              <th className="py-2 text-right font-semibold">Total</th>
              <th className="py-2 text-right font-semibold">Fuel</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.month} className={`border-b border-rule ${(i + 1) % 5 === 0 ? "border-b-[1.5px]" : ""}`}>
                <td className="num py-1.5">{m.month}</td>
                <td className="num py-1.5 text-right">{formatReading(m.businessDistanceTicks, units)}</td>
                <td className="num py-1.5 text-right">{formatReading(m.personalDistanceTicks, units)}</td>
                <td className="num py-1.5 text-right">
                  {formatReading(m.businessDistanceTicks + m.personalDistanceTicks + m.unclassifiedDistanceTicks, units)}
                </td>
                <td className="num py-1.5 text-right">${m.fuelSpend.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-[1.5px] border-ink font-semibold">
              <td className="py-2">Year</td>
              <td className="num py-2 text-right">{formatReading(s.businessDistanceTicks, units)}</td>
              <td className="num py-2 text-right">{formatReading(s.personalDistanceTicks, units)}</td>
              <td className="num py-2 text-right">{formatReading(total, units)}</td>
              <td className="num py-2 text-right">${s.fuelSpend.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </section>

      {/* Repeated on every printed page, so a stapled packet never loses its
          own number. */}
      <div className="hidden print:fixed print:bottom-0 print:left-0 print:right-0 print:block print:border-t print:border-ink print:pt-1 print:text-[10px]">
        {vehicle.name} · {year} · business {formatReading(s.businessDistanceTicks, units)} {unitLabel(units)}
        {deduction !== null && ` · deduction $${deduction.toFixed(2)}`}
      </div>
    </main>
  );
}

function Bar({ label, pct, token }: { label: string; pct: number; token: string }) {
  if (pct <= 0) return null;
  return (
    <div
      className="flex items-center justify-center overflow-hidden border-r border-paper text-[0.75rem] font-semibold text-ink last:border-r-0 print:border-ink print:bg-transparent"
      // Held back to a tint: the deduction figure is meant to be the loudest
      // thing on this page, and three saturated hues across the full width
      // were taking that away from it.
      style={{ width: `${pct}%`, background: `color-mix(in srgb, var(--cat-${token}) 32%, transparent)` }}
      title={`${label} ${pct.toFixed(1)}%`}
    >
      {pct > 6 && <span className="num">{label} {pct.toFixed(0)}%</span>}
    </div>
  );
}

function Fig({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1"><span className="num text-[1.25rem]">{value}</span> <span className="text-sm text-ink-muted">{unit}</span></p>
    </div>
  );
}
