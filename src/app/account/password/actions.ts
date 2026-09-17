"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  checkPasswordStrength,
  createSession,
  hashPassword,
  requireUser,
  revokeUserSessions,
  verifyPassword,
} from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";

export interface PasswordState {
  error?: string;
  ok?: boolean;
}

export async function changePassword(
  _prev: PasswordState,
  form: FormData,
): Promise<PasswordState> {
  const me = await requireUser();
  await assertSameOrigin();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two new passwords do not match." };
  const strength = checkPasswordStrength(next);
  if (!strength.ok) return { error: strength.message };

  const rows = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  const user = rows[0];
  if (!user) return { error: "Account not found." };
  if (!(await verifyPassword(user.passwordHash, current))) {
    return { error: "Your current password is not correct." };
  }
  if (current === next) return { error: "Choose a different password from the current one." };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, me.id));

  // Every other session for this account ends here, then a fresh one is
  // issued for the browser that made the change.
  await revokeUserSessions(me.id);
  await createSession(me.id);

  redirect("/");
}
