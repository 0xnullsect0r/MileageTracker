"use server";

import { redirect } from "next/navigation";
import { destroyCurrentSession, requireUser, revokeUserSessions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";

export async function logout(): Promise<void> {
  await assertSameOrigin();
  await destroyCurrentSession();
  redirect("/login");
}

/**
 * Kill every session for the current user, then send them back to /login.
 * Useful when a personal device is lost — one action, everywhere out.
 */
export async function signOutEverywhere(): Promise<void> {
  await assertSameOrigin();
  const me = await requireUser();
  await revokeUserSessions(me.id);
  redirect("/login");
}
