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
import { isVehicleColor } from "@/lib/vehicle-colors";

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
    color: isVehicleColor(text("color")) ? text("color") : null,
  };
}

/** A new photo replaces the old one; "remove" clears it. */
async function applyPhoto(vehicleId: string, form: FormData, previous: string | null): Promise<string | null> {
  const file = form.get("photo");
  const hasNew = file instanceof File && file.size > 0;
  if (!hasNew && form.get("removePhoto") !== "on") return null;

  const { removeAttachment, saveUpload } = await import("@/lib/uploads");
  let photoAttachmentId: string | null = null;
  if (hasNew) {
    const saved = await saveUpload(file, { vehicleId }, { thumb: true });
    if ("error" in saved) return saved.error;
    photoAttachmentId = saved.id;
  }
  await db.update(vehicles).set({ photoAttachmentId }).where(eq(vehicles.id, vehicleId));
  if (previous) await removeAttachment(previous);
  return null;
}

export async function createVehicle(_prev: VehicleState, form: FormData): Promise<VehicleState> {
  await requireUser();
  const values = readForm(form);
  if (!values.name) return { error: "Give the vehicle a name." };

  const created = (await db.insert(vehicles).values(values).returning({ id: vehicles.id }))[0]!;
  const photoError = await applyPhoto(created.id, form, null);
  revalidatePath("/", "layout");
  if (photoError) return { error: `The vehicle was added, but not the photo: ${photoError}` };
  redirect(`/vehicles/${created.id}/entries`);
}

export async function updateVehicle(_prev: VehicleState, form: FormData): Promise<VehicleState> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  const values = readForm(form);
  if (!values.name) return { error: "Give the vehicle a name." };

  const existing = (await db.select({ photo: vehicles.photoAttachmentId }).from(vehicles).where(eq(vehicles.id, id)).limit(1))[0];
  if (!existing) return { error: "Vehicle not found." };

  // Precision is a display setting: no stored reading is touched here.
  await db.update(vehicles).set({ ...values, updatedAt: new Date() }).where(eq(vehicles.id, id));
  const photoError = await applyPhoto(id, form, existing.photo);
  revalidatePath("/", "layout");
  if (photoError) return { error: `Saved, but not the photo: ${photoError}` };
  redirect(`/vehicles/${id}/entries`);
}

export async function archiveVehicle(form: FormData): Promise<void> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  await db
    .update(vehicles)
    .set({ isActive: false, archivedAt: new Date() })
    .where(eq(vehicles.id, id));
  revalidatePath("/", "layout");
  redirect("/");
}
