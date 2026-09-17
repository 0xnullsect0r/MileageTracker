import "server-only";
import { headers } from "next/headers";

/**
 * Same-origin gate for Server Actions and mutating routes.
 *
 * Next 16 already sets `sameSite=lax` on the session cookie, which blocks
 * cross-origin form POSTs at the browser. This pins it defense-in-depth:
 * if the request carries an Origin header (all fetch-based POSTs do), it
 * must match the Host we're being reached on. We accept missing Origin
 * (some server-to-server clients strip it) because a browser POST always
 * sends one.
 *
 * TRUST_PROXY is a promise the operator makes about their reverse proxy;
 * when it is on, we honour X-Forwarded-Host — that's the whole reason it
 * exists.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return;

  const forwardedHost = process.env.TRUST_PROXY === "true" ? h.get("x-forwarded-host") : null;
  const host = forwardedHost ?? h.get("host");
  if (!host) throw new OriginError("Missing Host header.");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new OriginError("Malformed Origin header.");
  }

  if (originHost !== host) {
    throw new OriginError(`Cross-origin request refused: origin=${originHost} host=${host}`);
  }
}

export class OriginError extends Error {}
