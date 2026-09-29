"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { entries, entryParts, serviceReminders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVehicle, latestReadingTicks, unitsOf } from "@/lib/data";
import { completeReminderIn } from "@/lib/reminders";
import { ReadingParseError, parseReading } from "@/lib/units";

export interface EntryState {
  error?: string;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function numeric(raw: string): string | null {
  if (raw === "") return null;
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? String(n) : null;
}

/** Create or, with an `id`, update an entry — with its parts, receipts and the reminders it took care of. */
export async function saveEntry(_prev: EntryState, form: FormData): Promise<EntryState> {
  const user = await requireUser();
  const vehicleId = text(form, "vehicleId");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };
  const id = text(form, "id") || null;

  const units = unitsOf(vehicle);
  const readingRaw = text(form, "reading");
  const occurredOn = text(form, "occurredOn");
  const categoryId = text(form, "categoryId");
  const description = text(form, "description");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: "Pick a date." };
  if (!categoryId) return { error: "Choose a category." };

  let readingTicks: number | null = null;
  if (readingRaw !== "") {
    try {
      readingTicks = parseReading(readingRaw, units);
    } catch (e) {
      return { error: e instanceof ReadingParseError ? e.message : "That reading is not valid." };
    }
  }

  let qty = numeric(text(form, "fuelQty"));
  let price = numeric(text(form, "pricePerUnit"));
  let cost = numeric(text(form, "cost"));
  // Any two of the three determine the third.
  if (qty && price && !cost) cost = (Number(qty) * Number(price)).toFixed(2);
  else if (qty && cost && !price) price = (Number(cost) / Number(qty)).toFixed(4);
  else if (price && cost && !qty) qty = (Number(cost) / Number(price)).toFixed(3);

  // Parts arrive as parallel lists; a row with no name is an empty repeater slot.
  const names = form.getAll("partName").map(String);
  const numbers = form.getAll("partNumber").map(String);
  const qtys = form.getAll("partQty").map(String);
  const unitCosts = form.getAll("partCost").map(String);
  const parts = names
    .map((name, i) => ({
      name: name.trim(),
      partNumber: numbers[i]?.trim() || null,
      qty: numeric(qtys[i]?.trim() ?? ""),
      unitCost: numeric(unitCosts[i]?.trim() ?? ""),
      sortOrder: i,
    }))
    .filter((p) => p.name !== "");
  const partsTotal = parts.reduce((a, p) => a + (p.unitCost ? Number(p.unitCost) * (p.qty ? Number(p.qty) : 1) : 0), 0);
  if (!cost && partsTotal > 0) cost = partsTotal.toFixed(2);

  const reminderIds = form.getAll("reminderId").map(String).filter(Boolean);

  const values = {
    categoryId,
    occurredOn,
    readingTicks,
    description: description || null,
    vendor: text(form, "vendor") || null,
    notes: text(form, "notes") || null,
    fuelQty: qty,
    fuelPricePerUnit: price,
    cost,
    isPartialFill: form.get("isPartialFill") === "on",
    odometerReset: form.get("odometerReset") === "on",
  };

  const fallbackTicks = readingTicks ?? (await latestReadingTicks(vehicleId));

  const entryId = await db.transaction(async (tx) => {
    let entryId: string;
    if (id) {
      const updated = await tx
        .update(entries)
        .set({ ...values, needsReview: false, reviewReason: null, updatedAt: new Date() })
        .where(and(eq(entries.id, id), eq(entries.vehicleId, vehicleId)))
        .returning({ id: entries.id });
      if (updated.length === 0) throw new Error("entry not found");
      entryId = id;
      await tx.delete(entryParts).where(eq(entryParts.entryId, id));
    } else {
      entryId = (await tx.insert(entries).values({ vehicleId, ...values, createdBy: user.id }).returning({ id: entries.id }))[0]!.id;
    }
    if (parts.length) await tx.insert(entryParts).values(parts.map((p) => ({ ...p, entryId })));

    if (reminderIds.length) {
      const rs = await tx
        .select()
        .from(serviceReminders)
        .where(and(inArray(serviceReminders.id, reminderIds), eq(serviceReminders.vehicleId, vehicleId), eq(serviceReminders.isDone, false)));
      for (const r of rs) {
        await completeReminderIn(tx, r, { on: occurredOn, ticks: fallbackTicks, entryId, userId: user.id });
      }
    }
    return entryId;
  });

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const { saveUpload } = await import("@/lib/uploads");
    const saved = await saveUpload(file, { entryId });
    if ("error" in saved) {
      revalidatePath("/", "layout");
      return { error: `The entry was saved, but not the file: ${saved.error}` };
    }
  }

  revalidatePath("/", "layout");
  redirect(`/vehicles/${vehicleId}/entries`);
}

/** A soft delete: the log hides it, and the banner offers it back. */
export async function deleteEntry(form: FormData): Promise<void> {
  await requireUser();
  const id = text(form, "id");
  const vehicleId = text(form, "vehicleId");
  await db
    .update(entries)
    .set({ deletedAt: new Date() })
    .where(and(eq(entries.id, id), eq(entries.vehicleId, vehicleId)));
  revalidatePath("/", "layout");
  redirect(`/vehicles/${vehicleId}/entries?deleted=${id}`);
}

export async function restoreEntry(form: FormData): Promise<void> {
  await requireUser();
  const id = text(form, "id");
  const vehicleId = text(form, "vehicleId");
  await db
    .update(entries)
    .set({ deletedAt: null })
    .where(and(eq(entries.id, id), eq(entries.vehicleId, vehicleId)));
  revalidatePath("/", "layout");
  redirect(`/vehicles/${vehicleId}/entries`);
}

export async function removeEntryAttachment(form: FormData): Promise<void> {
  await requireUser();
  const { removeAttachment } = await import("@/lib/uploads");
  await removeAttachment(text(form, "attachmentId"));
  revalidatePath("/", "layout");
}
