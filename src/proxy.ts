import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only (Next 16 calls this a Proxy; it was middleware).
 *
 * It checks for the PRESENCE of a session cookie so signed-out visitors are
 * redirected rather than rendering a shell. It deliberately does not touch
 * the database — this runs on every route including prefetches — and it does
 * NOT validate the session. Every page and Server Action re-checks
 * server-side via requireUser()/requireAdmin(); this is not authorization.
 */
const PUBLIC = ["/login", "/api/health"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!req.cookies.has("mt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
