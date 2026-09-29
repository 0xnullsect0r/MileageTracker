import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { CategoryMark, categoryBorder } from "@/components/Category";
import { CostChart } from "@/components/CostChart";
import { CostSummary } from "@/components/CostSummary";
import { Num, Reading } from "@/components/Reading";
import { type BoardReminder, ServiceBoard } from "@/components/maintenance/ServiceBoard";
import { Label } from "@/components/ui";
import { db } from "@/db";
import { serviceCompletions, serviceReminders } from "@/db/schema";
import {
  getVehicle,
  latestReadingTicks,
  loadDocuments,
  loadLog,
  loadReminders,
  todayIso,
  unitsOf,
  vehicleCosts,
} from "@/lib/data";
import { dueStatus } from "@/lib/maintenance";
import { presetEvery, presetsFor } from "@/lib/maintenance-presets";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const units = unitsOf(vehicle);
  const unit = unitLabel(units);
  const today = todayIso();
  const [log, current, reminders, documents, completions] = await Promise.all([
    loadLog(id),
    latestReadingTicks(id),
    loadReminders(id),
    loadDocuments(id, true),
    db
      .select({ c: serviceCompletions, description: serviceReminders.description })
      .from(serviceCompletions)
      .innerJoin(serviceReminders, eq(serviceReminders.id, serviceCompletions.reminderId))
      .where(eq(serviceReminders.vehicleId, id))
      .orderBy(desc(serviceCompletions.doneOn)),
  ]);

  const toUnits = (t: number | null) => (t === null ? "" : formatReading(t, units, { grouped: false }));
  const board: BoardReminder[] = reminders.map((r) => ({
    id: r.id,
    description: r.description,
    dueMode: r.dueMode,
    every: r.intervalTicks ? String(ticksToUnits(r.intervalTicks, units)) : "",
    everyMonths: r.intervalMonths?.toString() ?? "",
    lastDoneReading: toUnits(r.lastDoneReadingTicks),
    lastDoneOn: r.lastDoneOn ?? "",
    dueReading: "",
    dueOn: "",
    notes: r.notes ?? "",
    templateKey: r.templateKey ?? "",
    status: dueStatus(r, current, today, units),
    dueOnActual: r.dueMode === "READING" ? null : r.dueOn,
    dueReadingTicks: r.dueMode === "DATE" ? null : r.dueReadingTicks,
    snoozedUntil: r.snoozedUntil,
    intervalText:
      [
        r.intervalTicks ? `every ${ticksToUnits(r.intervalTicks, units).toLocaleString("en-US")} ${unit}` : null,
        r.intervalMonths ? `${r.intervalTicks ? "or " : "every "}${r.intervalMonths} mo` : null,
      ]
        .filter(Boolean)
        .join(" ") || "one-off",
  }));

  const presets = presetsFor(units).map((p) => ({ key: p.key, name: p.name, every: presetEvery(p, units), months: p.months ?? null }));

  // History: service entries, with the reminders each one took care of,
  // plus reminders marked done without an entry.
  const doneBy = new Map<string, string[]>();
  for (const { c, description } of completions) {
    if (c.entryId) doneBy.set(c.entryId, [...(doneBy.get(c.entryId) ?? []), description]);
  }
  type Row =
    | { type: "entry"; day: string; e: (typeof log)[number] }
    | { type: "done"; day: string; id: string; ticks: number | null; description: string };
  const history: Row[] = [
    ...log.filter((e) => e.category?.kind === "SERVICE").map((e) => ({ type: "entry" as const, day: e.occurredOn, e })),
    ...completions
      .filter(({ c }) => c.entryId === null)
      .map(({ c, description }) => ({ type: "done" as const, day: c.doneOn, id: c.id, ticks: c.readingTicks, description })),
  ].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));

  const costs = vehicleCosts(log, documents, units);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
        <div className="min-w-0">
          <ServiceBoard
            reminders={board}
            vehicleId={id}
            units={units}
            currentTicks={current}
            today={today}
            presets={presets}
          />

          <section className="mt-12" aria-labelledby="history-h">
            <h2 id="history-h" className="text-lg font-semibold tracking-tight">History</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-3 border-t border-rule">
                {history.map((row) =>
                  row.type === "entry" ? (
                    <li key={row.e.id} className="border-b border-rule py-2 pl-3" style={categoryBorder(row.e.category)}>
                      <Link href={`/vehicles/${id}/entries/${row.e.id}`} className="block hover:text-signal">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                          <span className="num w-24 shrink-0 text-[0.8125rem] text-ink-muted">{row.e.occurredOn}</span>
                          <CategoryMark category={row.e.category} />
                          <span className="min-w-0 flex-1 text-sm">{row.e.description ?? "Service"}</span>
                          {row.e.cost !== null && <Num value={row.e.cost} prefix="$" className="text-[0.8125rem]" />}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-4 pl-28 text-[0.8125rem] text-ink-muted max-sm:pl-0">
                          <Reading ticks={row.e.readingTicks} units={units} size="sm" withUnit />
                          {row.e.vendor && <span>{row.e.vendor}</span>}
                          {doneBy.get(row.e.id) && <span>took care of {doneBy.get(row.e.id)!.join(", ")}</span>}
                        </div>
                      </Link>
                    </li>
                  ) : (
                    <li key={row.id} className="border-b border-rule py-2 pl-3" style={categoryBorder(null)}>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                        <span className="num w-24 shrink-0 text-[0.8125rem] text-ink-muted">{row.day}</span>
                        <span className="min-w-0 flex-1 text-sm">{row.description}</span>
                        <span className="text-[0.8125rem] text-ink-muted">marked done</span>
                      </div>
                      {row.ticks !== null && (
                        <div className="mt-0.5 pl-28 max-sm:pl-0">
                          <Reading ticks={row.ticks} units={units} size="sm" withUnit className="text-ink-muted" />
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0" aria-labelledby="costs-h">
          <h2 id="costs-h" className="text-lg font-semibold tracking-tight">What it has cost</h2>
          {costs.allTime.total === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No costs recorded yet.</p>
          ) : (
            <>
              <CostSummary year={costs.year} thisYear={costs.thisYear} allTime={costs.allTime} perUnit={costs.perUnit} unit={unit === "h" ? "hour" : unit === "km" ? "km" : "mile"} />
              {costs.byYear.length > 1 && (
                <div className="mt-8">
                  <Label>By year</Label>
                  <CostChart data={costs.byYear} />
                </div>
              )}
            </>
          )}
          <p className="mt-6 text-sm text-ink-muted">
            Fees come from <Link href={`/vehicles/${id}/docs`} className="underline hover:text-ink">documents</Link> — registration, insurance and the like.
          </p>
        </aside>
      </div>
    </main>
  );
}
