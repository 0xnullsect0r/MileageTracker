"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { entries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVehicle, unitsOf } from "@/lib/data";
import { ReadingParseError, parseReading } from "@/lib/units";

export interface EntryState {
  error?: string;
}

export async function createEntry(_prev: EntryState, form: FormData): Promise<EntryState> {
  const user = await requireUser();
  const vehicleId = String(form.get("vehicleId") ?? "");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };

  const units = unitsOf(vehicle);
  const readingRaw = String(form.get("reading") ?? "").trim();
  const occurredOn = String(form.get("occurredOn") ?? "").trim();
  const categoryId = String(form.get("categoryId") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();

  if (!occurredOn) return { error: "Pick a date." };
  if (!categoryId) return { error: "Choose a category." };

  let readingTicks: number | null = null;
  if (readingRaw !== "") {
    try {
      readingTicks = parseReading(readingRaw, units);
    } catch (e) {
      return { error: e instanceof ReadingParseError ? e.message : "That reading is not valid." };
    }
  }

  const numeric = (key: string): string | null => {
    const raw = String(form.get(key) ?? "").trim();
    if (raw === "") return null;
    const n = Number(raw.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? String(n) : null;
  };

  let qty = numeric("fuelQty");
  let price = numeric("pricePerUnit");
  let cost = numeric("cost");
  // Any two of the three determine the third.
  if (qty && price && !cost) cost = (Number(qty) * Number(price)).toFixed(2);
  else if (qty && cost && !price) price = (Number(cost) / Number(qty)).toFixed(4);
  else if (price && cost && !qty) qty = (Number(cost) / Number(price)).toFixed(3);

  await db.insert(entries).values({
    vehicleId,
    categoryId,
    occurredOn,
    readingTicks,
    description: description || null,
    fuelQty: qty,
    fuelPricePerUnit: price,
    cost,
    isPartialFill: form.get("isPartialFill") === "on",
    odometerReset: form.get("odometerReset") === "on",
    createdBy: user.id,
  });

  revalidatePath(`/vehicles/${vehicleId}/entries`);
  revalidatePath("/");
  redirect(`/vehicles/${vehicleId}/entries`);
}
