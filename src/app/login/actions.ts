"use server";

import { desc, eq, isNotNull, sql as raw } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { entries, users, vehicles } from "@/db/schema";
import {
  clearRateLimit,
  clientIp,
  createSession,
  normaliseEmail,
  rateLimit,
  verifyPassword,
} from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  if (!email || !password) return { error: "Enter your email and password." };

  // Limited by IP and by account, so neither a single host nor a single
  // target can be hammered.
  const ip = clientIp(await headers());
  for (const key of [`ip:${ip}`, `user:${email}`]) {
    const { allowed, retryInSeconds } = rateLimit(key);
    if (!allowed) {
      const mins = Math.ceil(retryInSeconds / 60);
      return { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
    }
  }

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = found[0];

  // Same message and comparable work either way, so the response does not
  // reveal whether the address exists.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok || !user.isActive) {
    return { error: "That email and password do not match." };
  }

  clearRateLimit(`ip:${ip}`);
  clearRateLimit(`user:${email}`);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);

  redirect(user.mustChangePassword ? "/account/password" : safeNext(next));
}

/** Only same-origin paths, so ?next= cannot bounce someone off-site. */
function safeNext(next: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export interface LoginMasthead {
  vehicleName: string | null;
  readingTicks: number | null;
  meterType: "DISTANCE" | "HOURS";
  distanceUnit: "MI" | "KM";
  readingPrecision: "WHOLE" | "TENTHS" | "HOURS_MINUTES";
  entryCount: number;
  since: string | null;
}

/**
 * The login page's wordmark is the log itself. Public by necessity — it is
 * rendered before sign-in — so it exposes only what a glance at the car's
 * dashboard would: its name and its current reading.
 */
export async function getMasthead(): Promise<LoginMasthead | null> {
  const v = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.isActive, true))
    .orderBy(vehicles.sortOrder, vehicles.createdAt)
    .limit(1);
  const vehicle = v[0];
  if (!vehicle) return null;

  const latest = await db
    .select({ readingTicks: entries.readingTicks })
    .from(entries)
    .where(eq(entries.vehicleId, vehicle.id))
    .orderBy(desc(entries.occurredOn), desc(entries.readingTicks))
    .limit(1);

  const counts = await db
    .select({ n: raw<number>`count(*)::int`, since: raw<string | null>`min(${entries.occurredOn})` })
    .from(entries)
    .where(eq(entries.vehicleId, vehicle.id));

  return {
    vehicleName: vehicle.name,
    readingTicks: latest[0]?.readingTicks ?? null,
    meterType: vehicle.meterType,
    distanceUnit: vehicle.distanceUnit,
    readingPrecision: vehicle.readingPrecision,
    entryCount: counts[0]?.n ?? 0,
    since: counts[0]?.since ?? null,
  };
}
