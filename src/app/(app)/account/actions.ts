"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

/** Standard or large text, for the signed-in person only. */
export async function setTextSize(form: FormData): Promise<void> {
  const me = await requireUser();
  const largeText = form.get("size") === "large";
  await db.update(users).set({ largeText, updatedAt: new Date() }).where(eq(users.id, me.id));
  // The size is set on <html>, so the root layout has to render again.
  revalidatePath("/", "layout");
}
