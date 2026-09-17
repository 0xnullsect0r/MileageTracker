import Link from "next/link";
import { Climb } from "@/components/Climb";
import { CategoryMark, categoryBorder } from "@/components/Category";
import { Computed, Delta, Num, Reading } from "@/components/Reading";
import { Banner, Button, Label, Rule, Stat } from "@/components/ui";
import { listVehicles, loadLog, unitsOf, vehicleOverview } from "@/lib/data";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const all = await listVehicles();

  if (all.length === 0) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8">
        <h1 className="text-[2rem] font-semibold tracking-tight">Garage</h1>
        <Rule className="mt-6 max-w-2xl" />
        <p className="mt-6 max-w-prose text-ink-muted">
          Nothing here yet. Add a vehicle, then import your spreadsheet into it.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/vehicles/new"><Button variant="primary">Add a vehicle</Button></Link>
          <Link href="/import"><Button>Import a spreadsheet</Button></Link>
        </div>
      </main>
    );
  }

  // The vehicle you actually drive leads. Everything else is a row.
  const overviews = await Promise.all(all.map((v) => vehicleOverview(v.id)));
  const ranked = overviews
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => (a.daysSinceLastEntry ?? 1e9) - (b.daysSinceLastEntry ?? 1e9));
  const lead = ranked[0]!;
  const rest = ranked.slice(1);
  const log = await loadLog(lead.vehicle.id);
  const recent = [...log].reverse().slice(0, 6);

  const stale =
    lead.daysSinceLastEntry !== null &&
    lead.typicalGapDays !== null &&
    lead.daysSinceLastEntry > Math.max(7, lead.typicalGapDays * 4);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      {/* 8/4 split. The reading leads; the rail carries what is due. */}
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr] lg:gap-16">
        <section className="min-w-0">
          <Label>{lead.vehicle.name}</Label>
          <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-2">
            <Reading
              ticks={lead.currentReadingTicks}
              units={lead.units}
              reference={lead.previousReadingTicks}
              size="hero"
              withUnit
            />
            {lead.currentReadingTicks !== null && lead.previousReadingTicks !== null && (
              <Delta ticks={lead.currentReadingTicks - lead.previousReadingTicks} units={lead.units} />
            )}
          </div>

          <div className="mt-8">
            <Climb entries={log} units={lead.units} height={52} />
          </div>

          {/* Every figure sits under the thing it describes. */}
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label={`${new Date().getFullYear()} business`}>
              <span className="num text-[1.5rem]">
                {formatReading(lead.ytd.businessDistanceTicks, lead.units)}
              </span>
              <span className="ml-1 text-sm text-ink-muted">{unitLabel(lead.units)}</span>
            </Stat>
            <Stat label={`${new Date().getFullYear()} personal`}>
              <span className="num text-[1.5rem]">
                {formatReading(lead.ytd.personalDistanceTicks, lead.units)}
              </span>
              <span className="ml-1 text-sm text-ink-muted">{unitLabel(lead.units)}</span>
            </Stat>
            {lead.vehicle.meterType === "DISTANCE" && (
              <Stat label="Economy" hint="last 6 tanks">
                {lead.recentEconomyTicksPerUnit !== null ? (
                  <Computed>
                    <Num value={ticksToUnits(lead.recentEconomyTicksPerUnit, lead.units)} dp={1} />
                    <span className="ml-1">{unitLabel(lead.units)}/gal</span>
                  </Computed>
                ) : (
                  <span className="num text-ink-muted">—</span>
                )}
              </Stat>
            )}
            <Stat
              label="Last entry"
              hint={lead.lastEntryOn ?? undefined}
            >
              <span className={stale ? "num text-[1.5rem]" : "num text-[1.5rem]"} style={stale ? { color: "var(--signal)" } : undefined}>
                {lead.daysSinceLastEntry === null ? "—" : `${lead.daysSinceLastEntry}d`}
              </span>
            </Stat>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={`/vehicles/${lead.vehicle.id}/entries/new`}>
              <Button variant="primary">Add entry</Button>
            </Link>
            <Link href={`/vehicles/${lead.vehicle.id}/entries`}>
              <Button>Open log</Button>
            </Link>
            <a
              href={`/reports/export?range=last-month&vehicle=${lead.vehicle.id}`}
              className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink"
            >
              Download last month
            </a>
            {rest.length > 0 && (
              <a
                href="/reports/export?range=last-month&vehicle=all"
                className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink"
              >
                Every vehicle
              </a>
            )}
          </div>

          {lead.needsReviewCount > 0 && (
            <div className="mt-8">
              <Banner>
                <Link
                  href={`/vehicles/${lead.vehicle.id}/entries?review=1`}
                  className="inline-flex min-h-11 items-center underline"
                >
                  {lead.needsReviewCount} {lead.needsReviewCount === 1 ? "entry needs" : "entries need"} review
                </Link>
              </Banner>
            </div>
          )}

          <div className="mt-10">
            <Label>Recent</Label>
            <div className="mt-3">
              {recent.map((e, i) => {
                const prev = recent[i + 1]?.readingTicks ?? null;
                return (
                  <div
                    key={e.id}
                    className="flex min-w-0 items-baseline gap-4 border-b border-rule py-2 pl-3"
                    style={categoryBorder(e.category)}
                  >
                    <span className="num w-20 shrink-0 text-[0.8125rem] text-ink-muted">
                      {e.occurredOn.slice(5)}
                    </span>
                    <CategoryMark category={e.category} />
                    <Reading ticks={e.readingTicks} units={lead.units} reference={prev} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{e.description}</span>
                    <span className="ml-auto shrink-0">
                      <Delta ticks={e.distanceTicks} units={lead.units} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="min-w-0">
          <Label>Due</Label>
          <div className="mt-3">
            {lead.dueReminders.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing scheduled.</p>
            ) : (
              lead.dueReminders.map((r) => {
                const remaining =
                  r.dueReadingTicks !== null && lead.currentReadingTicks !== null
                    ? r.dueReadingTicks - lead.currentReadingTicks
                    : null;
                const overdue = remaining !== null && remaining <= 0;
                return (
                  <div key={r.id} className="border-b border-rule py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{r.description}</span>
                      {remaining !== null && (
                        <span
                          className="num shrink-0 text-sm"
                          style={overdue ? { color: "var(--signal)" } : undefined}
                        >
                          {overdue ? "overdue" : formatReading(remaining, lead.units)}
                        </span>
                      )}
                    </div>
                    {r.dueOn && <span className="num text-[0.75rem] text-ink-muted">{r.dueOn}</span>}
                  </div>
                );
              })
            )}
          </div>

          {rest.length > 0 && (
            <div className="mt-10">
              <Label>Other vehicles</Label>
              {/* A table, not a grid of cards: denser, faster to scan, and it
                  does not go meaningless when a tractor with no fuel data
                  joins the garage. */}
              <table className="mt-3 w-full">
                <tbody>
                  {rest.map((o) => (
                    <tr key={o.vehicle.id} className="border-b border-rule">
                      <td className="py-2 pr-3">
                        <Link href={`/vehicles/${o.vehicle.id}/entries`} className="text-sm hover:text-signal">
                          {o.vehicle.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right">
                        <Reading ticks={o.currentReadingTicks} units={o.units} size="sm" withUnit />
                      </td>
                      <td className="num py-2 pl-3 text-right text-[0.75rem] text-ink-muted">
                        {o.daysSinceLastEntry === null ? "—" : `${o.daysSinceLastEntry}d`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-10">
            <Link
              href="/vehicles/new"
              className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink"
            >
              Add a vehicle
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
