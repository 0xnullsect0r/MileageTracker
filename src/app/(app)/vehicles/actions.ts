"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  type MeterType,
  type ReadingPrecision,
  allowedPrecisions,
} from "@/lib/units";

export interface VehicleState {
  error?: string;
}

function readForm(form: FormData) {
  const meterType = String(form.get("meterType") ?? "DISTANCE") as MeterType;
  let readingPrecision = String(form.get("readingPrecision") ?? "WHOLE") as ReadingPrecision;
  // Hours-and-minutes is meaningless on an odometer; fall back rather than
  // storing a combination the formatter cannot honour.
  if (!allowedPrecisions(meterType).includes(readingPrecision)) readingPrecision = "WHOLE";

  const text = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const int = (k: string) => {
    const v = text(k);
    return v === null ? null : Number.parseInt(v, 10);
  };

  return {
    name: String(form.get("name") ?? "").trim(),
    year: int("year"),
    make: text("make"),
    model: text("model"),
    plate: text("plate"),
    vin: text("vin"),
    meterType,
    readingPrecision,
    distanceUnit: String(form.get("distanceUnit") ?? "MI") as "MI" | "KM",
    fuelUnit: String(form.get("fuelUnit") ?? "GAL_US") as "GAL_US" | "GAL_IMP" | "L" | "KWH",
    tankCapacity: text("tankCapacity"),
    notes: text("notes"),
  };
}

export async function createVehicle(_prev: VehicleState, form: FormData): Promise<VehicleState> {
  await requireUser();
  const values = readForm(form);
  if (!values.name) return { error: "Give the vehicle a name." };

  const created = (await db.insert(vehicles).values(values).returning({ id: vehicles.id }))[0]!;
  revalidatePath("/");
  redirect(`/vehicles/${created.id}/entries`);
}

export async function updateVehicle(_prev: VehicleState, form: FormData): Promise<VehicleState> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  const values = readForm(form);
  if (!values.name) return { error: "Give the vehicle a name." };

  // Precision is a display setting: no stored reading is touched here.
  await db.update(vehicles).set({ ...values, updatedAt: new Date() }).where(eq(vehicles.id, id));
  revalidatePath(`/vehicles/${id}/entries`);
  revalidatePath("/");
  redirect(`/vehicles/${id}/entries`);
}

export async function archiveVehicle(form: FormData): Promise<void> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  await db
    .update(vehicles)
    .set({ isActive: false, archivedAt: new Date() })
    .where(eq(vehicles.id, id));
  revalidatePath("/");
  redirect("/");
}
