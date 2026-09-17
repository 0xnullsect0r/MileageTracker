import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CategoryMark, categoryBorder } from "@/components/Category";
import { Num, Reading } from "@/components/Reading";
import { ReminderForm } from "@/components/ReminderForm";
import { ReminderRow } from "@/components/ReminderRow";
import { Label, Rule } from "@/components/ui";
import { db } from "@/db";
import { serviceReminders } from "@/db/schema";
import { getVehicle, latestReadingTicks, loadLog, unitsOf } from "@/lib/data";
import { formatReading, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();

  const units = unitsOf(vehicle);
  const [log, current, reminders] = await Promise.all([
    loadLog(id),
    latestReadingTicks(id),
    db
      .select()
      .from(serviceReminders)
      .where(and(eq(serviceReminders.vehicleId, id), eq(serviceReminders.isDone, false)))
      .orderBy(asc(serviceReminders.dueReadingTicks)),
  ]);

  const history = log.filter((e) => e.category?.kind === "SERVICE").reverse();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>{vehicle.name}</Label>
          <h1 className="mt-1 text-[2rem] font-semibold tracking-tight">Service</h1>
        </div>
        <div className="flex gap-5">
          <Link href={`/vehicles/${id}/entries`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Log</Link>
          <Link href={`/vehicles/${id}/fuel`} className="inline-flex min-h-11 items-center text-sm text-ink-muted hover:text-ink">Fuel</Link>
        </div>
      </div>

      <Rule className="mt-6" />

      <section className="mt-8 max-w-2xl">
        <Label>Due</Label>
        {reminders.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nothing scheduled.</p>
        ) : (
          <div className="mt-3">
            {reminders.map((r) => {
              const remaining =
                r.dueReadingTicks !== null && current !== null ? r.dueReadingTicks - current : null;
              const overdueByDate = r.dueOn !== null && r.dueOn < today;
              const overdue = (remaining !== null && remaining <= 0) || overdueByDate;
              // A hairline filling toward due: 0% just serviced, 100% due now.
              const progress =
                remaining !== null && r.intervalTicks
                  ? Math.min(100, Math.max(0, 100 - (remaining / r.intervalTicks) * 100))
                  : overdue
                    ? 100
                    : null;

              return (
                <ReminderRow
                  key={r.id}
                  id={r.id}
                  description={r.description}
                  remaining={remaining}
                  overdue={overdue}
                  overdueByDate={overdueByDate}
                  dueOn={r.dueOn}
                  units={units}
                  progress={progress}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10 max-w-2xl">
        <Label>Add a reminder</Label>
        <ReminderForm vehicleId={id} units={units} />
      </section>

      <section className="mt-10">
        <Label>History</Label>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <div className="mt-3 max-w-3xl">
            {history.map((e) => (
              <Link
                key={e.id}
                href={`/vehicles/${id}/entries/${e.id}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-2 pl-3 hover:bg-paper-raised"
                style={categoryBorder(e.category)}
              >
                <span className="num w-24 shrink-0 text-[0.8125rem] text-ink-muted">{e.occurredOn}</span>
                <CategoryMark category={e.category} />
                <Reading ticks={e.readingTicks} units={units} size="sm" />
                <span className="min-w-0 flex-1 text-sm">{e.description}</span>
                {e.cost !== null && <Num value={e.cost} prefix="$" className="text-[0.8125rem]" />}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
