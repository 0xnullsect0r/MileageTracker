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
- **Quick vehicle switching.** A vehicle switcher in the top bar (on a phone,
  in the bottom bar, next to Log · Fuel · Service · Add) jumps to the same page
  for another vehicle: on Fuel for the car, pick the truck, land on the
  truck's Fuel. The garage page shows every vehicle and everything due.
- **Maintenance reminders.** Due by distance or hours, by date, or whichever
  comes first, repeating on an interval. Start from the usual items (oil,
  tire rotation, filters, grease fittings for an hour meter…) and adjust.
  Logging a service entry ticks off the reminders it took care of and
  schedules the next one; the switcher and Service tab show a count of
  anything due.
- **Documents and running costs.** Registration, insurance, inspections and
  warranties with expiry dates and what each cost. Service pages and reports
  show cost of ownership — fuel, service and fees — per year and per mile.
- **Receipts and details.** Attach a photo or PDF to any fuel or service
  entry or document. Service entries carry the shop, a parts list and notes.
  Any entry can be edited or deleted, with an undo.
- **Large text.** Anyone can switch to larger type and controls under
  *Your account* in their name menu. It follows them to every device and
  changes nobody else's view.
- **Accounts.** Everyone signed in shares the garage. Administrators add and
  remove people and reset passwords; a reset ends that person's sessions
  immediately.
- **Editable categories and tax rates.** `/admin/settings` adds or renames
  categories — each tagged with the behaviour it drives — and corrects the
  IRS rate for any year.

## Running it

```sh
git clone https://github.com/0xnullsect0r/MileageTracker.git && cd MileageTracker
cp .env.example .env      # then edit it — every value marked change-me
git config core.hooksPath .githooks   # lets `git pull` apply compose changes
docker compose up -d
```

The images come prebuilt from GitHub Container Registry; nothing is compiled
on the server.

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
| `UPLOAD_DIR` | Where receipts and photos are stored. Default `/app/uploads`, the `uploads` volume. Back it up with the database. |
| `IMAGE_TAG` | Image version to run. Default `latest`; see [Updates](#updates). |
| `WATCHTOWER_POLL_INTERVAL` | Seconds between checks for a new release. Default `300`. |

## Updates

Two kinds of change reach a running server, by two routes.

**New code** arrives on its own. Pushing a version tag runs the Release
workflow: typecheck and tests, then both images are built and published to
GHCR and a GitHub Release is cut.

```sh
git tag v1.2.3 && git push origin v1.2.3
```

The `watchtower` service checks GHCR every five minutes. When `:latest` has
moved, it pulls the new image, recreates `app` and `parser` with their
existing settings, and deletes the old image. It never touches Postgres.
Migrations run as the new `app` starts, so a release can change the schema —
take a `pg_dump` first if you want a way back.

Pre-release tags (`v1.3.0-rc.1`) are published under their version only and
do not move `:latest`, so they never reach a server that follows it.

**Changes to `docker-compose.yml`** — a new setting, a new service — are
not watchtower's job. `git pull` brings them in, and the hook enabled by
`git config core.hooksPath .githooks` runs `docker compose up -d` whenever a
pull changed that file. Without the hook, run it yourself after pulling.

**To pin or roll back**, set `IMAGE_TAG` in `.env` to a published version
(`1.2.3`) or build (`sha-abc1234`) and run `docker compose up -d`. A pinned
tag never moves, so watchtower leaves it alone until you set it back to
`latest`.

### Moving an existing install to published images

Earlier versions built the images on the server. Once the first release has
been published, run this from the same checkout, so the project name and
therefore the data volumes stay the same:

```sh
docker compose exec db pg_dump -U logbook logbook > backup.sql
git pull
git config core.hooksPath .githooks
docker compose up -d --remove-orphans
docker image prune -f      # the old locally built images
```

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

To run the whole stack from this checkout rather than from GHCR:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

The overlay builds both images locally and leaves watchtower out.

`/styleguide` renders every token and primitive on one page.

For a small made-up garage (a car, a truck and a tractor, with reminders and
documents) to build against without the real spreadsheet:

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/dev-seed.ts
```

Set `UPLOAD_DIR` to a writable folder when running `pnpm dev` outside Docker.

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
