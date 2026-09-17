# Security

## Threat model in one sentence

A single-tenant self-hosted app whose data (ten years of vehicle logs)
matters more than most people realise, sitting behind an operator-provided
HTTPS reverse proxy on a small server.

## What the app trusts

- The reverse proxy in front of it — when `TRUST_PROXY=true` it honours
  `X-Forwarded-For` and `X-Forwarded-Host`, so the proxy must be under your
  control and must not accept those headers from clients.
- Its own database — code holding a Drizzle handle is authoritative.
- The Docker network — Postgres and the parser are not published to the host.
- The people you give admin accounts to.

## What the app does NOT trust

- The `.numbers` file uploaded by a user. It is parsed by the `parser`
  sidecar, which runs read-only, drops all Linux capabilities, has no
  DB and no network egress, and receives 512 MiB of memory. If the
  parser is compromised, it can crash but it cannot read secrets or
  reach the log.
- Attachments (`entry_attachments`). Every upload is size-capped,
  magic-byte-sniffed against a small allowlist (JPEG/PNG/WebP/PDF), and
  streamed back with a locked-down CSP and `X-Content-Type-Options:
  nosniff`. Filenames are sanitised before being stored.
- The Origin of any browser POST. Every mutating Server Action calls
  `assertSameOrigin()` after auth, refusing requests whose Origin does not
  match Host (or `X-Forwarded-Host` under TRUST_PROXY).

## Measures in place

1. **Passwords** are hashed with argon2id via `@node-rs/argon2` (OWASP
   defaults). No password is ever written to a log or an audit row.
2. **Sessions** are stored server-side. The cookie carries a random token;
   the database stores only its SHA-256. Deletion of the user, a password
   change, or "sign out everywhere" instantly revokes every session.
3. **Rate limiting** on failed logins: 8 attempts per 15 minutes per IP
   AND per account, so neither a single host nor a single target can be
   hammered.
4. **CSRF**: `sameSite=lax` on the session cookie blocks cross-origin form
   POSTs at the browser; `assertSameOrigin()` pins it defence-in-depth.
5. **CSP** on every response (`src/proxy.ts`): `default-src 'self'`,
   `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`.
6. **Security headers**: `X-Content-Type-Options: nosniff`,
   `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`,
   `Permissions-Policy` denying camera/mic/geolocation/USB/payment,
   `Strict-Transport-Security` when the app is served over HTTPS.
7. **Boot-time defaults check**: bootstrap refuses to start under
   `NODE_ENV=production` if `ADMIN_PASSWORD`, `ADMIN_EMAIL`, or
   `SESSION_SECRET` is still an `.env.example` value.
8. **First sign-in** forces a password change; the admin's initial
   password never survives it.
9. **Instant revocation**: a password reset by an administrator ends every
   session that user held.
10. **Audit log**: every mutation writes to `audit_log`, viewable at
    `/admin/audit`. Actor id is captured; PII is not.

## Reporting a vulnerability

Open a private GitHub Security Advisory. Do not open a public issue for a
security bug. Include reproduction steps and the version you found it on.

## What is out of scope

- Multi-tenant isolation. There is one garage per stack; every signed-in
  user shares it.
- Denial of service from an authenticated user. There are no per-user
  quotas on writes beyond the 10 MB attachment cap.
- Client-side attacks by a signed-in user against themselves.
- Hosting-provider compromises.
