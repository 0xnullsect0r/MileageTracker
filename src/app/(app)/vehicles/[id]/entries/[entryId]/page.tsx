import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { QuickEntry } from "@/components/QuickEntry";
import { db } from "@/db";
import { entries, entryParts, serviceCompletions, serviceReminders } from "@/db/schema";
import { getVehicle, listCategories, loadLog, loadReminders, todayIso, unitsOf } from "@/lib/data";
import { reminderOptions } from "@/lib/entry-form";
import { formatReading } from "@/lib/units";
import { listAttachments } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(entryId)) notFound();
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();
  const entry = (
    await db
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.vehicleId, id), isNull(entries.deletedAt)))
      .limit(1)
  )[0];
  if (!entry) notFound();

  const units = unitsOf(vehicle);
  const today = todayIso();
  const [cats, log, reminders, parts, files, completed] = await Promise.all([
    listCategories(id),
    loadLog(id),
    loadReminders(id),
    db.select().from(entryParts).where(eq(entryParts.entryId, entryId)).orderBy(asc(entryParts.sortOrder)),
    listAttachments({ entryId }),
    db
      .select({ description: serviceReminders.description })
      .from(serviceCompletions)
      .innerJoin(serviceReminders, eq(serviceReminders.id, serviceCompletions.reminderId))
      .where(eq(serviceCompletions.entryId, entryId)),
  ]);

  // Checked against the reading before this one in the log, not the latest.
  const at = log.findIndex((e) => e.id === entryId);
  const previous = log.slice(0, Math.max(0, at)).reverse().find((e) => e.readingTicks !== null)?.readingTicks ?? null;
  const current = log.filter((e) => e.readingTicks !== null).at(-1)?.readingTicks ?? null;
  const str = (v: string | null) => (v === null ? "" : String(Number(v)));

  return (
    <main className="px-4 pb-10 pt-6 sm:px-8">
      <QuickEntry
        vehicleId={id}
        vehicleName={vehicle.name}
        units={units}
        categories={cats.map((c) => ({ id: c.id, code: c.code, name: c.name, kind: c.kind }))}
        lastReadingTicks={previous}
        today={today}
        reminders={reminderOptions(reminders, current, today, units)}
        entry={{
          id: entry.id,
          occurredOn: entry.occurredOn,
          reading: entry.readingTicks === null ? "" : formatReading(entry.readingTicks, units, { grouped: false }),
          categoryId: entry.categoryId ?? "",
          description: entry.description ?? "",
          pricePerUnit: str(entry.fuelPricePerUnit),
          fuelQty: str(entry.fuelQty),
          cost: entry.cost === null ? "" : Number(entry.cost).toFixed(2),
          isPartialFill: entry.isPartialFill,
          odometerReset: entry.odometerReset,
          vendor: entry.vendor ?? "",
          notes: entry.notes ?? "",
          parts: parts.map((p) => ({
            name: p.name,
            partNumber: p.partNumber ?? "",
            qty: str(p.qty),
            unitCost: p.unitCost === null ? "" : Number(p.unitCost).toFixed(2),
          })),
          attachments: files.map((f) => ({ id: f.id, filename: f.filename, mime: f.mime })),
          completed: completed.map((c) => c.description),
          reviewReason: entry.needsReview ? entry.reviewReason : null,
        }}
      />
    </main>
  );
}
