import Link from "next/link";
import { cookies } from "next/headers";
import { Reading } from "@/components/Reading";
import { DueBadge, VehicleMark } from "@/components/VehicleMark";
import { QuickDone } from "@/components/maintenance/QuickDone";
import { Label, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { type DueItem, type VehicleOverview, listVehicles, vehicleCosts, vehicleOverview } from "@/lib/data";
import { describeDue } from "@/lib/due-text";
import { needsAttention } from "@/lib/maintenance";
import { COOKIE_TAB, isVehicleTab, vehiclePath } from "@/lib/nav";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";
import { vehicleColor } from "@/lib/vehicle-colors";

export const dynamic = "force-dynamic";

export default async function Garage() {
  const all = await listVehicles();

  if (all.length === 0) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8">
        <h1 className="text-[2rem] font-semibold tracking-tight">Garage</h1>
        <hr className="mt-6 h-px max-w-2xl border-0 bg-rule" aria-hidden />
        <p className="mt-6 max-w-prose text-ink-muted">
          Nothing here yet. Add a vehicle, then import your spreadsheet into it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/vehicles/new" className={buttonClass("primary")}>Add a vehicle</Link>
          <Link href="/import" className={buttonClass()}>Import a spreadsheet</Link>
        </div>
      </main>
    );
  }

  const [overviews, jar] = await Promise.all([Promise.all(all.map((v) => vehicleOverview(v.id))), cookies()]);
  const fleet = overviews.filter((o): o is VehicleOverview => o !== null);
  const lastTab = jar.get(COOKIE_TAB)?.value;
  const tab = isVehicleTab(lastTab) && lastTab !== "add" ? lastTab : "log";
  const year = new Date().getFullYear();

  // Everything needing attention, across the fleet, most urgent first.
  const due = fleet
    .flatMap((o) => o.dueItems.filter((i) => needsAttention(i.status)).map((i) => ({ i, o })))
    .sort((a, b) => {
      const rank = { overdue: 3, due: 2, soon: 1, ok: 0 };
      return rank[b.i.status.state] - rank[a.i.status.state] || (b.i.status.progress ?? 0) - (a.i.status.progress ?? 0);
    });
  const review = fleet.filter((o) => o.needsReviewCount > 0);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-8 md:pt-10">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
        <section className="min-w-0" aria-labelledby="fleet-h">
          <h1 id="fleet-h" className="text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">Garage</h1>

          <ul className="mt-4 border-t-[1.5px] border-ink">
            {fleet.map((o) => (
              <VehicleRow key={o.vehicle.id} o={o} href={vehiclePath(o.vehicle.id, tab)} />
            ))}
          </ul>
          <Link href="/vehicles/new" className="mt-2 inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">
            Add a vehicle
          </Link>
        </section>

        <aside className="min-w-0 space-y-12">
          <section aria-labelledby="due-h">
            <h2 id="due-h" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              Due
              <DueBadge count={due.length} overdue={due.filter((d) => d.i.status.state === "overdue").length} />
            </h2>
            {due.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nothing due or coming up.</p>
            ) : (
              <ul className="mt-3 border-t border-rule">
                {due.map(({ i, o }) => (
                  <DueRow key={i.id} i={i} o={o} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="year-h">
            <h2 id="year-h" className="text-lg font-semibold tracking-tight">{year} so far</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule text-left">
                    <th className="py-2 font-normal"><span className="sr-only">Vehicle</span></th>
                    <th className="py-2 text-right font-normal"><Label>Business</Label></th>
                    <th className="py-2 text-right font-normal"><Label>Personal</Label></th>
                    <th className="py-2 text-right font-normal"><Label>Spent</Label></th>
                  </tr>
                </thead>
                <tbody>
                  {fleet.map((o) => {
                    const spent = vehicleCosts(o.log, o.documents, o.units).thisYear.total;
                    return (
                      <tr key={o.vehicle.id} className="border-b border-rule">
                        <td className="py-2 pr-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <VehicleMark color={o.vehicle.color} />
                            <span className="truncate">{o.vehicle.name}</span>
                          </span>
                        </td>
                        <td className="num py-2 text-right">{formatReading(o.ytd.businessDistanceTicks, o.units)}</td>
                        <td className="num py-2 text-right">{formatReading(o.ytd.personalDistanceTicks, o.units)}</td>
                        <td className="num py-2 text-right">${Math.round(spent).toLocaleString("en-US")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[0.8125rem] text-ink-muted">Distance in each vehicle&rsquo;s own unit. Spent is fuel, service and fees.</p>
            </div>
          </section>

          {review.length > 0 && (
            <section aria-labelledby="review-h">
              <h2 id="review-h" className="text-lg font-semibold tracking-tight">Needs review</h2>
              <ul className="mt-3 border-t border-rule">
                {review.map((o) => (
                  <li key={o.vehicle.id} className="border-b border-rule">
                    <Link href={`/vehicles/${o.vehicle.id}/entries?review=1`} className="flex min-h-11 items-center gap-2 text-sm hover:text-signal">
                      <VehicleMark color={o.vehicle.color} />
                      <span className="flex-1">{o.vehicle.name}</span>
                      <span className="num">{o.needsReviewCount} {o.needsReviewCount === 1 ? "entry" : "entries"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function VehicleRow({ o, href }: { o: VehicleOverview; href: string }) {
  const v = o.vehicle;
  const subtitle = [v.year, v.make, v.model].filter(Boolean).join(" ");
  const next = o.dueItems[0] ?? null;
  const attention = o.dueItems.filter((i) => needsAttention(i.status));
  const overdue = attention.filter((i) => i.status.state === "overdue").length;
  const stale =
    o.daysSinceLastEntry !== null && o.typicalGapDays !== null && o.daysSinceLastEntry > Math.max(7, o.typicalGapDays * 4);
  const nextText = next ? describeDue(next.status, next.dueOn, next.dueReadingTicks, o.units, null, next.type === "document") : null;
  const urgent = next && (next.status.state === "overdue" || next.status.state === "due");

  return (
    <li className="relative border-b border-rule">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 pl-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]" style={{ borderLeft: `3px solid ${vehicleColor(v.color)}` }}>
        {/* The whole row opens the vehicle; the Add button sits above that link. */}
        <Link href={href} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']">
          {v.photoAttachmentId && <VehicleMark color={v.color} photoId={v.photoAttachmentId} size="lg" className="max-sm:size-11" />}
          <span className="min-w-0">
            {subtitle && (
              <span className="block truncate text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">{subtitle}</span>
            )}
            <span className="block truncate text-lg font-semibold leading-snug">{v.name}</span>
            <span className="mt-0.5 block">
              <Reading ticks={o.currentReadingTicks} units={o.units} size="md" withUnit />
            </span>
          </span>
        </Link>

        <div className="col-span-2 row-start-2 min-w-0 text-sm sm:col-span-1 sm:row-start-auto">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <dt className="text-ink-muted">Last entry</dt>
            <dd className={cn("num", stale && "text-signal")}>
              {o.daysSinceLastEntry === null ? "—" : o.daysSinceLastEntry === 0 ? "today" : `${o.daysSinceLastEntry}d ago`}
            </dd>
            {v.meterType === "DISTANCE" && o.recentEconomyTicksPerUnit !== null && (
              <>
                <dt className="text-ink-muted">Economy</dt>
                <dd className="num">
                  {ticksToUnits(o.recentEconomyTicksPerUnit, o.units).toFixed(1)} {unitLabel(o.units)}/gal
                </dd>
              </>
            )}
            <dt className="text-ink-muted">Next</dt>
            <dd className="min-w-0">
              {next && nextText ? (
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="truncate">{next.title}</span>
                  <span className={cn("num text-[0.8125rem]", urgent ? "font-semibold text-signal" : "text-ink-muted")}>{nextText.primary}</span>
                  {attention.length > 1 && <DueBadge count={attention.length} overdue={overdue} />}
                </span>
              ) : (
                <span className="text-ink-muted">nothing tracked</span>
              )}
            </dd>
          </dl>
        </div>

        <Link href={vehiclePath(v.id, "add")} className={buttonClass("primary", "relative z-10 col-start-2 row-start-1 self-start justify-self-end px-4 sm:col-start-3 sm:self-center")}>
          <span aria-hidden>+</span>
          <span className="max-sm:sr-only">Add entry</span>
          <span className="sr-only"> for {v.name}</span>
        </Link>
      </div>
    </li>
  );
}

function DueRow({ i, o }: { i: DueItem; o: VehicleOverview }) {
  const text = describeDue(i.status, i.dueOn, i.dueReadingTicks, o.units, null, i.type === "document");
  const urgent = i.status.state === "overdue" || i.status.state === "due";
  const page = i.type === "document" ? "docs" : "service";
  return (
    <li className="flex items-center gap-3 border-b border-rule py-2">
      <Link href={vehiclePath(o.vehicle.id, page)} className="min-w-0 flex-1 hover:text-signal">
        <span className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
          <VehicleMark color={o.vehicle.color} />
          <span className="truncate">{o.vehicle.name}{i.kindLabel ? ` · ${i.kindLabel}` : ""}</span>
        </span>
        <span className="block truncate text-sm">{i.title}</span>
        <span className={cn("num block text-[0.8125rem]", urgent ? "font-semibold text-signal" : "text-ink-muted")}>
          {text.primary}
        </span>
      </Link>
      {i.type === "reminder" ? (
        <QuickDone id={i.id} label={i.title} />
      ) : (
        <Link href={vehiclePath(o.vehicle.id, "docs")} className={buttonClass("secondary", "min-h-11 px-3 text-sm")}>
          Renew
        </Link>
      )}
    </li>
  );
}
