import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only (Next 16 calls this a Proxy; it was middleware).
 *
 * It checks for the PRESENCE of a session cookie so signed-out visitors are
 * redirected rather than rendering a shell. It deliberately does not touch
 * the database — this runs on every route including prefetches — and it does
 * NOT validate the session. Every page and Server Action re-checks
 * server-side via requireUser()/requireAdmin(); this is not authorization.
 *
 * Also injects security headers on every response.
 */
const PUBLIC = ["/login", "/api/health"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  let response: NextResponse;
  if (isPublic) {
    response = NextResponse.next();
  } else if (!req.cookies.has("mt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  applySecurityHeaders(response);
  return response;
}

/**
 * Defence-in-depth headers. CSP is deliberately narrow: 'self' for
 * everything, plus inline styles because Tailwind's runtime uses them.
 * `img-src` allows data: URIs for the small SVG icon in public/. Attachment
 * routes ship their own tighter CSP.
 */
function applySecurityHeaders(res: NextResponse): void {
  res.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      // Next 16 uses a nonce we don't own here; keep 'unsafe-inline' for
      // Tailwind's <style> injection but nothing else.
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "same-origin");
  res.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()",
  );
  if (process.env.COOKIE_SECURE !== "false") {
    // We only send HSTS when the app expects to be reached over HTTPS —
    // otherwise a plain-HTTP LAN deployment would break its own users.
    res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
