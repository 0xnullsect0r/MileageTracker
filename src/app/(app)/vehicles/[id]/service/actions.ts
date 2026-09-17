"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, serviceReminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { getVehicle, unitsOf } from "@/lib/data";
import { ReadingParseError, parseReading } from "@/lib/units";

export interface ReminderState {
  error?: string;
  ok?: boolean;
}

/**
 * The reminder is anchored to whichever of "next reading" and "next date"
 * the user supplied. Interval fields are stored so the next time the
 * matching service entry lands (see markReminderAtOrAfter), a fresh
 * reminder is spawned automatically.
 */
export async function createReminder(_prev: ReminderState, form: FormData): Promise<ReminderState> {
  const user = await requireUser();
  await assertSameOrigin();

  const vehicleId = String(form.get("vehicleId") ?? "");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };

  const description = String(form.get("description") ?? "").trim();
  if (!description) return { error: "Give it a description." };

  const units = unitsOf(vehicle);
  const dueReadingRaw = String(form.get("dueReading") ?? "").trim();
  const dueOn = String(form.get("dueOn") ?? "").trim() || null;
  const intervalReadingRaw = String(form.get("intervalReading") ?? "").trim();
  const intervalMonthsRaw = String(form.get("intervalMonths") ?? "").trim();

  let dueReadingTicks: number | null = null;
  if (dueReadingRaw) {
    try {
      dueReadingTicks = parseReading(dueReadingRaw, units);
    } catch (e) {
      return {
        error: e instanceof ReadingParseError ? e.message : "That reading is not valid.",
      };
    }
  }

  let intervalTicks: number | null = null;
  if (intervalReadingRaw) {
    try {
      intervalTicks = parseReading(intervalReadingRaw, units);
    } catch (e) {
      return {
        error: e instanceof ReadingParseError ? e.message : "That interval is not valid.",
      };
    }
  }

  const intervalMonths = intervalMonthsRaw ? Number(intervalMonthsRaw) : null;
  if (intervalMonths !== null && (!Number.isInteger(intervalMonths) || intervalMonths <= 0)) {
    return { error: "Months must be a positive whole number." };
  }

  if (dueReadingTicks === null && dueOn === null) {
    return { error: "Give it either a reading target or a date." };
  }

  const [inserted] = await db
    .insert(serviceReminders)
    .values({
      vehicleId,
      description,
      dueReadingTicks,
      dueOn,
      intervalTicks,
      intervalMonths,
    })
    .returning({ id: serviceReminders.id });

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "reminder.create",
    targetType: "service_reminder",
    targetId: inserted?.id ?? null,
    meta: { vehicleId, description },
  });

  revalidatePath(`/vehicles/${vehicleId}/service`);
  revalidatePath("/");
  return { ok: true };
}

export async function markReminderDone(reminderId: string, done: boolean): Promise<void> {
  const user = await requireUser();
  await assertSameOrigin();

  const [row] = await db
    .select({ vehicleId: serviceReminders.vehicleId })
    .from(serviceReminders)
    .where(eq(serviceReminders.id, reminderId))
    .limit(1);
  if (!row) return;

  await db
    .update(serviceReminders)
    .set({ isDone: done })
    .where(eq(serviceReminders.id, reminderId));

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: done ? "reminder.done" : "reminder.reopen",
    targetType: "service_reminder",
    targetId: reminderId,
  });

  revalidatePath(`/vehicles/${row.vehicleId}/service`);
  revalidatePath("/");
}

export async function deleteReminder(reminderId: string): Promise<void> {
  const user = await requireUser();
  await assertSameOrigin();

  const [row] = await db
    .select({ vehicleId: serviceReminders.vehicleId })
    .from(serviceReminders)
    .where(eq(serviceReminders.id, reminderId))
    .limit(1);
  if (!row) return;

  await db.delete(serviceReminders).where(eq(serviceReminders.id, reminderId));

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "reminder.delete",
    targetType: "service_reminder",
    targetId: reminderId,
  });

  revalidatePath(`/vehicles/${row.vehicleId}/service`);
  revalidatePath("/");
}

/**
 * Called from the "add SERVICE entry" flow: any reminder whose reading
 * target this entry crosses (dueReadingTicks <= entry reading) is marked
 * done and linked to that entry.
 */
export async function completeCrossedReminders(
  vehicleId: string,
  entryId: string,
  readingTicks: number,
): Promise<void> {
  const open = await db
    .select({ id: serviceReminders.id, due: serviceReminders.dueReadingTicks })
    .from(serviceReminders)
    .where(
      and(eq(serviceReminders.vehicleId, vehicleId), eq(serviceReminders.isDone, false)),
    );

  for (const r of open) {
    if (r.due !== null && r.due <= readingTicks) {
      await db
        .update(serviceReminders)
        .set({ isDone: true, completedEntryId: entryId })
        .where(eq(serviceReminders.id, r.id));
    }
  }
}
