"use server";

import { addDays, format, parseISO } from "date-fns";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { serviceReminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVehicle, latestReadingTicks, todayIso, unitsOf } from "@/lib/data";
import { type DueMode, nextCycle } from "@/lib/maintenance";
import { presetByKey, presetIntervals } from "@/lib/maintenance-presets";
import { completeReminderIn } from "@/lib/reminders";
import { ReadingParseError, type VehicleUnits, parseReading, unitsToTicks } from "@/lib/units";

export interface ReminderState {
  error?: string;
  ok?: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function positive(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/[,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function reading(form: FormData, key: string, units: VehicleUnits): number | null {
  const raw = text(form, key);
  if (raw === "") return null;
  return parseReading(raw, units);
}

/** Every Server Action that changes what is due re-renders the whole app: the switcher badge lives in the root layout. */
function refresh() {
  revalidatePath("/", "layout");
}

interface ParsedReminder {
  description: string;
  dueMode: DueMode;
  intervalTicks: number | null;
  intervalMonths: number | null;
  dueReadingTicks: number | null;
  dueOn: string | null;
  lastDoneOn: string | null;
  lastDoneReadingTicks: number | null;
  notes: string | null;
  templateKey: string | null;
}

function parseReminder(form: FormData, units: VehicleUnits, current: number | null): ParsedReminder | string {
  const description = text(form, "description");
  if (!description) return "Say what needs doing.";

  const every = positive(form, "every");
  const everyMonths = positive(form, "everyMonths");
  if (Number.isNaN(every) || Number.isNaN(everyMonths)) return "Intervals must be positive numbers.";
  if (everyMonths !== null && !Number.isInteger(everyMonths)) return "Months must be a whole number.";

  let lastDoneReadingTicks: number | null;
  let dueReadingOverride: number | null;
  try {
    lastDoneReadingTicks = reading(form, "lastDoneReading", units);
    dueReadingOverride = reading(form, "dueReading", units);
  } catch (e) {
    return e instanceof ReadingParseError ? e.message : "That reading is not valid.";
  }
  const lastDoneOn = text(form, "lastDoneOn") || null;
  const dueOnOverride = text(form, "dueOn") || null;
  if ((lastDoneOn && !ISO.test(lastDoneOn)) || (dueOnOverride && !ISO.test(dueOnOverride))) return "Dates must be yyyy-mm-dd.";

  const intervalTicks = every === null ? null : unitsToTicks(every, units);
  const intervalMonths = everyMonths;

  const requested = text(form, "dueMode") as DueMode;
  // The mode follows what was actually filled in, so a "whichever first"
  // reminder with no month interval does not silently wait on a date.
  const hasReading = intervalTicks !== null || dueReadingOverride !== null;
  const hasDate = intervalMonths !== null || dueOnOverride !== null;
  let dueMode: DueMode = hasReading && hasDate ? "EITHER" : hasReading ? "READING" : "DATE";
  if (requested === "READING" && hasReading) dueMode = "READING";
  if (requested === "DATE" && hasDate) dueMode = "DATE";
  if (!hasReading && !hasDate) return "Give it an interval, or a reading or date it is due.";

  // Due point: an explicit one wins; otherwise one interval after it was last done.
  const fromTicks = lastDoneReadingTicks ?? current;
  const fromOn = lastDoneOn ?? todayIso();
  const cycle = nextCycle({ dueMode, intervalTicks, intervalMonths, dueReadingTicks: null }, fromOn, fromTicks);

  return {
    description,
    dueMode,
    intervalTicks,
    intervalMonths,
    dueReadingTicks: dueMode === "DATE" ? null : dueReadingOverride ?? cycle.dueReadingTicks,
    dueOn: dueMode === "READING" ? null : dueOnOverride ?? cycle.dueOn,
    lastDoneOn,
    lastDoneReadingTicks,
    notes: text(form, "notes") || null,
    templateKey: text(form, "templateKey") || null,
  };
}

export async function saveReminder(_prev: ReminderState, form: FormData): Promise<ReminderState> {
  await requireUser();
  const vehicleId = text(form, "vehicleId");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };
  const units = unitsOf(vehicle);

  const parsed = parseReminder(form, units, await latestReadingTicks(vehicleId));
  if (typeof parsed === "string") return { error: parsed };

  const id = text(form, "id");
  if (id) {
    await db
      .update(serviceReminders)
      .set({ ...parsed, snoozedUntil: null, updatedAt: new Date() })
      .where(and(eq(serviceReminders.id, id), eq(serviceReminders.vehicleId, vehicleId)));
  } else {
    await db.insert(serviceReminders).values({ vehicleId, ...parsed });
  }
  refresh();
  return { ok: Date.now() };
}

export async function deleteReminder(form: FormData): Promise<void> {
  await requireUser();
  await db.delete(serviceReminders).where(eq(serviceReminders.id, text(form, "id")));
  refresh();
}

export async function completeReminder(_prev: ReminderState, form: FormData): Promise<ReminderState> {
  const user = await requireUser();
  const reminder = (await db.select().from(serviceReminders).where(eq(serviceReminders.id, text(form, "id"))).limit(1))[0];
  if (!reminder) return { error: "That reminder no longer exists." };
  const vehicle = (await getVehicle(reminder.vehicleId))!;

  const doneOn = text(form, "doneOn") || todayIso();
  if (!ISO.test(doneOn)) return { error: "Dates must be yyyy-mm-dd." };
  let ticks: number | null;
  try {
    ticks = reading(form, "doneReading", unitsOf(vehicle)) ?? (await latestReadingTicks(vehicle.id));
  } catch (e) {
    return { error: e instanceof ReadingParseError ? e.message : "That reading is not valid." };
  }

  await db.transaction((tx) => completeReminderIn(tx, reminder, { on: doneOn, ticks, entryId: null, userId: user.id }));
  refresh();
  return { ok: Date.now() };
}

export async function snoozeReminder(form: FormData): Promise<void> {
  await requireUser();
  const days = Math.max(1, Math.min(365, Number(text(form, "days")) || 7));
  const until = format(addDays(parseISO(todayIso()), days), "yyyy-MM-dd");
  await db
    .update(serviceReminders)
    .set({ snoozedUntil: until, updatedAt: new Date() })
    .where(eq(serviceReminders.id, text(form, "id")));
  refresh();
}

/** Add several presets at once, each starting from today's reading. */
export async function addPresets(_prev: ReminderState, form: FormData): Promise<ReminderState> {
  await requireUser();
  const vehicleId = text(form, "vehicleId");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };
  const units = unitsOf(vehicle);
  const keys = form.getAll("preset").map(String);
  if (keys.length === 0) return { error: "Pick at least one." };

  const current = await latestReadingTicks(vehicleId);
  const today = todayIso();
  const rows = keys
    .map(presetByKey)
    .filter((p) => p !== undefined)
    .map((p) => {
      const iv = presetIntervals(p, units);
      const cycle = nextCycle({ ...iv, dueReadingTicks: null }, today, current);
      return {
        vehicleId,
        description: p.name,
        templateKey: p.key,
        ...iv,
        dueReadingTicks: cycle.dueReadingTicks,
        dueOn: cycle.dueOn,
        lastDoneOn: null,
        lastDoneReadingTicks: null,
      };
    });
  if (rows.length) await db.insert(serviceReminders).values(rows);
  refresh();
  return { ok: Date.now() };
}
