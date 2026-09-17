# v1.0.0 release notes

## What's in the box

A self-hosted mileage/fuel/service logbook, wire-compatible with a decade of
Apple Numbers rows. Three docker services (`app` on Next.js 16, `db` on
Postgres 17, `parser` on a hardened Python sidecar) behind your existing
reverse proxy.

## Everything shipped this cycle

### Features

- Multi-vehicle garage; DISTANCE and HOURS meter types; WHOLE / TENTHS /
  HOURS_MINUTES display precision, all stored as an exact integer
  `reading_ticks` so nothing drifts.
- Correct tank-to-tank fuel economy (fill groups), not per-fill
  arithmetic that lies about splash-and-dash.
- `.numbers` and CSV import with outlier review: monotonicity, impossible
  fuel qty, cost≠price×qty, wrong-year dates, missing fields, cross-sheet
  duplicates. Undecided findings import as-is and are flagged, never
  quietly changed.
- Reports: business/personal split, editable IRS rates by year, deduction
  estimate, printable.
- CSV export: one vehicle or every vehicle, calendar year, previous
  month, or explicit `from`/`to`.
- Service reminders with reading target and/or date; auto-closes when a
  SERVICE entry crosses the target.
- Attachments (receipts) per entry: JPEG/PNG/WebP/PDF, 10 MB cap,
  server-side magic-byte sniff, streamed download.
- Admin: user CRUD, password reset with instant session revocation,
  editable categories and IRS rates, read-only audit-log viewer.

### Ops

- `/api/health` (cheap) and `/api/health?deep=1` (parser + migration head).
- Structured JSON logs to stdout (`src/lib/log.ts`).
- Root `error.tsx` and `not-found.tsx` in the paper/ink language.
- CI on GitHub Actions: typecheck, tests, migration apply against real
  Postgres 17, design-token guards (no purple, no gradients, no emoji in
  headings), docker image builds.
- Dependabot for npm (grouped), pip, docker, and github-actions.

### Security

- argon2id passwords, hashed session tokens, sameSite=lax + belt-and-braces
  `assertSameOrigin()` on every mutation.
- Login rate limits by IP AND account (8 / 15 min).
- CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff,
  Referrer-Policy, Permissions-Policy, HSTS when COOKIE_SECURE.
- Bootstrap refuses to start under NODE_ENV=production with any
  `.env.example` default still in place.
- Sign-out-everywhere action on `/account/password`.
- Audit log for every mutation.

### Docs

- README, `SECURITY.md`, `docs/OPERATIONS.md`, `docs/BACKUPS.md`,
  `docs/UPGRADING.md`.

### Test coverage

- 132 vitest tests: units, derive, outliers, real-file reconciliation
  (±2¢ across 10 years), report ranges, attachment magic-byte sniff and
  filename sanitiser, auth primitives and rate limiter, same-origin guard.
- E2E scripts: `e2e/deployed-smoke.mjs`, `e2e/import-flow.mjs`,
  `e2e/full-run.mjs`, `e2e/shots.mjs` at 375/768/1024/1440.

## Pre-flight rehearsal (run this on the target host)

The sandbox that built this branch has no Docker daemon, so the following
must be run on the host that will actually run production. Every step is
green-or-fail; do not tag `v1.0.0` until all of them are green.

```sh
# 1. Fresh volumes.
docker compose down -v

# 2. Set .env from .env.example and edit every "change-me". SESSION_SECRET
#    must be `openssl rand -base64 48`, not a keyboard-mash. If bootstrap
#    refuses to boot, this is what it means.

# 3. Boot.
docker compose up -d --build

# 4. Wait for healthy.
until curl -fs http://localhost:3000/api/health | grep -q '"status":"ok"'; do sleep 1; done

# 5. Smoke test against a fresh admin.
node e2e/deployed-smoke.mjs

# 6. Import the real spreadsheet, walk the outlier review, commit.
node e2e/import-flow.mjs   # (or do it manually to see the UI)

# 7. Full-run E2E covers auth, adding entries, editing, exports.
node e2e/full-run.mjs

# 8. Screenshots at all four widths.
node e2e/shots.mjs

# 9. Reconciliation.
pnpm test tests/import-real-file.test.ts    # ±2¢ across 10 years

# 10. Backup and restore drill.
sh docs/backup-example.sh                   # from docs/BACKUPS.md
# ...tear down, restore, boot, smoke again.
```

## Tag and cut

Once (1)–(10) are all green:

```sh
git tag -s v1.0.0 -m "First production release"
git push origin v1.0.0
gh release create v1.0.0 --generate-notes \
  review-screenshots/*.png
```

## Known gaps

- No zero-downtime upgrade path (single app container). See
  `docs/UPGRADING.md`.
- No accessibility audit against WCAG 2.2 has been run; the code follows
  the CLAUDE.md floor (semantic HTML, focus states, `prefers-reduced-motion`
  respected) but nothing has been externally validated.
- No penetration test performed. The threat model in `SECURITY.md` is
  a self-assessment.
