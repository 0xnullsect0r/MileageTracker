# Logbook

A self-hosted mileage, fuel and service log. It replaces a decade-old Apple
Numbers spreadsheet — 3,338 rows kept since November 2016 — with something
that holds several vehicles, understands hour meters as well as odometers,
and gets the fuel-economy maths right.

Runs as one `docker compose` stack behind your existing reverse proxy.

## What it does

- **Odometer or hour meter.** A car counts miles or kilometres; a tractor or
  dirt bike counts hours. Readings display as whole units, tenths, or
  `210:25`. Changing that setting never rewrites stored data — see
  [The units model](#the-units-model).
- **Correct fuel economy.** The spreadsheet measured every fill against the
  previous one, so a splash-and-dash produced 69.6 mpg followed by 5.35. This
  groups fills from one full tank to the next and reports one honest figure.
- **Business and personal split**, with editable IRS standard mileage rates
  and a deduction estimate. The reports page is built to be printed.
- **`.numbers` import with outlier review.** Upload the file; anything that
  cannot be right is shown in the company of its neighbours, with a proposed
  correction where the arithmetic is unambiguous. Nothing is corrected
  silently, and the whole import can be undone.
- **Accounts.** Everyone signed in shares the garage. Administrators add and
  remove people and reset passwords; a reset ends that person's sessions
  immediately. `/account/password` has a "sign out everywhere" button for
  the lost-phone case.
- **Editable categories and tax rates.** `/admin/settings` adds or renames
  categories — each tagged with the behaviour it drives — and corrects the
  IRS rate for any year.
- **Service reminders.** Add reminders on the service page with either a
  reading target or a date; the dashboard rail shows what's due. A SERVICE
  entry whose reading crosses a reminder's target closes it automatically.
- **Attachments.** Any entry accepts JPEG, PNG, WebP or PDF receipts, up
  to 10 MB per file. MIME is set from a server-side magic-byte sniff, not
  the client's claim.
- **Audit trail.** `/admin/audit` lists every mutation the app makes,
  paginated and filterable by actor, action or date. Read-only.
- **CSV export.** `/reports/export` produces an itemised CSV for one
  vehicle or all vehicles, over a calendar year, the previous month, or an
  explicit `from`/`to` range.

## Running it

```sh
cp .env.example .env      # then edit it — every value marked change-me
docker compose up -d
```

Then point your reverse proxy at `APP_PORT` (3000 by default) and sign in
with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. You are made to choose your own
password before anything else.

Neither Postgres nor the parser is published to the host: only the app is,
and only on the one port your proxy needs.

### Configuration

| Variable | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | Database password. Required. |
| `SESSION_SECRET` | `openssl rand -base64 48`. Required. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first administrator, created on first boot. |
| `APP_PORT` | Host port for your proxy. Default `3000`. |
| `TRUST_PROXY` | `true` when something else terminates TLS. Default `true`. |
| `COOKIE_SECURE` | Set `false` only for plain HTTP on a trusted LAN. |
| `MAX_UPLOAD_MB` | Upload ceiling. Default `32`. |

## The three services

| Service | Why it exists |
|---|---|
| `app` | Next.js. Runs migrations and creates the first admin at boot, then serves. |
| `db` | PostgreSQL 17. Not published to the host. |
| `parser` | Reads `.numbers` files. They are Snappy-compressed protobuf with no viable Node parser, so this keeps Python out of the app image. It has no database, no volumes, no published port, a read-only filesystem, and drops all capabilities — it parses untrusted uploads. |

## The units model

Readings are stored as an exact integer, `reading_ticks`. Ticks per unit is
fixed by **meter type**, not by display precision: 100 per mile or kilometre,
60 per hour.

Two things follow, and both matter:

- Distances are exact integer subtraction, so nothing drifts across 3,300 rows.
- **Precision is display-only.** Switching a tractor from whole hours to
  hours-and-minutes is a settings change, not a data migration.

`src/lib/units.ts` owns every conversion. Nothing else in the codebase divides
by 100 or 60.

## Importing

Upload `.numbers` or CSV at `/import`. The wizard reads the file, proposes a
column mapping, and shows you everything questionable before writing a row.

Detectors cover: readings that break monotonicity (an odometer cannot go back
down), impossible fuel quantities, costs that disagree with price × quantity,
rows dated outside their sheet's year, missing dates and categories, and rows
repeated between sheets. Where a single digit edit fits between the
neighbouring readings, that correction is offered; where several fit, you
choose.

Two rules govern the whole thing:

1. Clean rows produce **zero** findings. A detector that cries wolf across
   3,300 rows is worse than no detector.
2. Nothing is corrected silently. An undecided finding imports as it stands
   and is flagged for review, never quietly changed.

## Development

```sh
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db parser
export DATABASE_URL="postgres://logbook:devpass@localhost:55432/logbook"
export PARSER_URL="http://localhost:58000"
pnpm exec tsx src/db/migrate.ts && node scripts/bootstrap.mjs
pnpm dev
```

`/styleguide` renders every token and primitive on one page.

### Tests

```sh
pnpm test                                   # units, derivation, outliers, the real file
set -a && . ./.env && set +a                # the e2e scripts sign in with ADMIN_*
node e2e/deployed-smoke.mjs                 # against a running compose stack
node e2e/shots.mjs                          # screenshots at 375 / 768 / 1024 / 1440
```

`deployed-smoke.mjs` expects a stack that has never been signed into, since
its first check is that the initial password must be changed. Reset with
`docker compose down -v && docker compose up -d` before running it.

The suite runs against a fixture taken from the actual spreadsheet, so the
numbers it asserts are measured rather than invented. The strongest check
reconciles every dollar of fuel across ten years to within two cents: each is
either imported or deliberately skipped, and the test says which.

## Operations, backups, upgrades

- `docs/OPERATIONS.md` — reverse-proxy configs (Caddy, nginx), env-var
  reference, log-shipping options, a quick-triage runbook.
- `docs/BACKUPS.md` — daily backup script, restore recipe, monthly
  restore drill.
- `docs/UPGRADING.md` — how migrations run at boot, how to regenerate
  them, when a rollback is safe and when it isn't.
- `SECURITY.md` — what the app trusts, what it doesn't, the measures in
  place, and how to report a vulnerability.
