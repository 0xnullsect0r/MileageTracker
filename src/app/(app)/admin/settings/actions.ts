"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories, mileageRates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export interface SettingsState {
  error?: string;
  ok?: string;
}

export async function saveRate(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const year = Number.parseInt(String(form.get("year") ?? ""), 10);
  const business = String(form.get("rateBusiness") ?? "").trim();

  if (!Number.isInteger(year) || year < 1990 || year > 2100) return { error: "Enter a real year." };
  const rate = Number(business);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10) {
    return { error: "Enter the rate per mile, for example 0.70." };
  }

  await db
    .insert(mileageRates)
    .values({ year, rateBusiness: String(rate) })
    .onConflictDoUpdate({ target: mileageRates.year, set: { rateBusiness: String(rate) } });

  revalidatePath("/admin/settings");
  revalidatePath("/reports");
  return { ok: `${year} set to $${rate.toFixed(3)} per mile.` };
}

export async function saveCategory(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "").trim();
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const kind = String(form.get("kind") ?? "TRIP") as "TRIP" | "FUEL" | "SERVICE" | "NOTE";
  const isBusiness = form.get("isBusiness") === "on";

  if (!code || !name) return { error: "A category needs a code and a name." };
  if (code.length > 4) return { error: "Keep the code to four characters or fewer — it has to fit the log." };

  if (id) {
    await db.update(categories).set({ code, name, kind, isBusiness }).where(eq(categories.id, id));
  } else {
    const clash = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(isNull(categories.vehicleId), eq(categories.code, code)))
      .limit(1);
    if (clash.length > 0) return { error: `The code "${code}" is already in use.` };
    await db.insert(categories).values({ code, name, kind, isBusiness, sortOrder: 99 });
  }

  revalidatePath("/admin/settings");
  return { ok: `${name} saved.` };
}

export async function archiveCategory(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  // Archived, never deleted: entries keep pointing at it, so the history of
  // what a row meant stays intact.
  await db.update(categories).set({ isArchived: true }).where(eq(categories.id, id));
  revalidatePath("/admin/settings");
}
