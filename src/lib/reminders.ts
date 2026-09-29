import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { serviceCompletions, serviceReminders, type ServiceReminder } from "@/db/schema";
import { nextCycle } from "@/lib/maintenance";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Record that a reminder was taken care of, and roll it to its next cycle.
 * A one-off reminder is finished instead. Runs inside the caller's
 * transaction so logging a service entry and ticking off its reminders is
 * all-or-nothing.
 */
export async function completeReminderIn(
  tx: Tx,
  reminder: ServiceReminder,
  done: { on: string; ticks: number | null; entryId: string | null; userId: string },
): Promise<void> {
  await tx.insert(serviceCompletions).values({
    reminderId: reminder.id,
    entryId: done.entryId,
    doneOn: done.on,
    readingTicks: done.ticks,
    createdBy: done.userId,
  });
  const next = nextCycle(reminder, done.on, done.ticks);
  await tx
    .update(serviceReminders)
    .set({
      lastDoneOn: done.on,
      lastDoneReadingTicks: done.ticks,
      completedEntryId: done.entryId,
      snoozedUntil: null,
      updatedAt: new Date(),
      ...(next.isDone ? { isDone: true } : { dueReadingTicks: next.dueReadingTicks, dueOn: next.dueOn }),
    })
    .where(eq(serviceReminders.id, reminder.id));
}
