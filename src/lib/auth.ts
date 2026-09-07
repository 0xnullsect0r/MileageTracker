import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

const COOKIE = "mt_session";
const SESSION_DAYS = 30;

/* ----------------------------------------------------------- passwords */

export function hashPassword(plain: string): Promise<string> {
  // argon2id defaults from @node-rs/argon2 are OWASP-current.
  return argonHash(plain);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hashValue, plain);
  } catch {
    return false;
  }
}

export interface PasswordRule {
  ok: boolean;
  message?: string;
}

export function checkPasswordStrength(plain: string): PasswordRule {
  if (plain.length < 10) return { ok: false, message: "Use at least 10 characters." };
  if (/^\d+$/.test(plain)) return { ok: false, message: "Use more than just digits." };
  return { ok: true };
}

/* ------------------------------------------------------------ sessions */

/** The cookie carries the token; the table stores only its hash. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);

  const h = await headers();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: clientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
    expires: expiresAt,
  });

  // Opportunistic cleanup; cheap and keeps the table from growing forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return token;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  mustChangePassword: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(COOKIE);
}

/**
 * Instant revocation. Called on password change and on user deletion — this
 * is the reason sessions live in the database rather than in a JWT.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/* ------------------------------------------------------------- guards */

export class AuthError extends Error {}

/** Every Server Action calls this. Middleware alone is not authorization. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AuthError("Administrator access required.");
  return user;
}

/* -------------------------------------------------- login rate limiting */

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

/** In-process and deliberately simple: one app container, one admin, no Redis. */
export function rateLimit(key: string): { allowed: boolean; retryInSeconds: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryInSeconds: 0 };
  }
  b.count++;
  if (b.count > MAX_ATTEMPTS) {
    return { allowed: false, retryInSeconds: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryInSeconds: 0 };
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function clientIp(h: Headers): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
  }
  return h.get("x-real-ip") ?? "unknown";
}

/** Constant-time compare, for anywhere a secret is checked directly. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type { User };
