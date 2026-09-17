"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import {
  checkPasswordStrength,
  hashPassword,
  normaliseEmail,
  requireAdmin,
  revokeUserSessions,
} from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";

export interface AdminState {
  error?: string;
  ok?: string;
}

async function record(actorId: string, action: string, targetId: string, meta?: unknown) {
  await db.insert(auditLog).values({
    actorUserId: actorId,
    action,
    targetType: "user",
    targetId,
    meta: meta === undefined ? null : (meta as object),
  });
}

export async function createUser(_prev: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireAdmin();
  await assertSameOrigin();
  const email = normaliseEmail(String(form.get("email") ?? ""));
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "USER") === "ADMIN" ? "ADMIN" : "USER";

  if (!email || !name) return { error: "Name and email are both needed." };
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "Someone already uses that email." };

  const created = (
    await db
      .insert(users)
      .values({
        email,
        name,
        role,
        passwordHash: await hashPassword(password),
        // They set their own on first sign-in; this one is a handover only.
        mustChangePassword: true,
      })
      .returning({ id: users.id })
  )[0]!;

  await record(me.id, "user.create", created.id, { email, role });
  revalidatePath("/admin/users");
  return { ok: `${name} can now sign in and will be asked to set their own password.` };
}

export async function resetPassword(_prev: AdminState, form: FormData): Promise<AdminState> {
  const me = await requireAdmin();
  await assertSameOrigin();
  const id = String(form.get("id") ?? "");
  const password = String(form.get("password") ?? "");
  const strength = checkPasswordStrength(password);
  if (!strength.ok) return { error: strength.message };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id));

  // Their existing sessions end now, not when they next expire.
  await revokeUserSessions(id);
  await record(me.id, "user.reset_password", id);
  revalidatePath("/admin/users");
  return { ok: "Password changed. That account is signed out everywhere." };
}

export async function setRole(form: FormData): Promise<void> {
  const me = await requireAdmin();
  await assertSameOrigin();
  const id = String(form.get("id") ?? "");
  const role = String(form.get("role") ?? "USER") === "ADMIN" ? "ADMIN" : "USER";

  if (id === me.id && role === "USER") {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN"));
    // Never let the last administrator lock everyone out.
    if (admins.length <= 1) return;
  }
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
  await record(me.id, "user.set_role", id, { role });
  revalidatePath("/admin/users");
}

export async function deleteUser(form: FormData): Promise<void> {
  const me = await requireAdmin();
  await assertSameOrigin();
  const id = String(form.get("id") ?? "");
  if (id === me.id) return;

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN"));
  const target = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (target[0]?.role === "ADMIN" && admins.length <= 1) return;

  await revokeUserSessions(id);
  await db.delete(users).where(eq(users.id, id));
  await record(me.id, "user.delete", id, { email: target[0]?.email });
  revalidatePath("/admin/users");
}
