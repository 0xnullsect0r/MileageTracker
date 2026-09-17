# Upgrading

## What happens at boot

`docker-entrypoint.sh` runs, in order:

1. `node /app/scripts/migrate.mjs` — applies any migrations in
   `./drizzle` that haven't been applied yet.
2. `node /app/scripts/bootstrap.mjs` — creates the first admin (if
   missing), seeds global categories, and inserts published IRS mileage
   rates. Idempotent — safe on every start.
3. `node server.js` — Next.js starts, and only then is the healthcheck
   answered.

Migrations run on a single connection and take an advisory lock, so two
app containers racing to boot cannot corrupt the migration table.

## Regenerating migrations

Never hand-edit anything in `./drizzle`. The workflow is:

```sh
# Edit src/db/schema.ts. Then, locally, against a dev DB:
export DATABASE_URL="postgres://logbook:devpass@localhost:55432/logbook"
pnpm db:generate
```

Drizzle-kit writes a new `NNNN_*.sql` and an entry in
`drizzle/meta/_journal.json`. Commit both. On the next deploy,
`migrate.mjs` picks up the new file and applies it.

## Rollback

Drizzle migrations are one-way by default. The safe rollback strategy is:

1. Restore the database from the most recent pre-upgrade backup (see
   `docs/BACKUPS.md`).
2. Redeploy the app image from the previous release tag.

For migrations that are purely additive (a new column, a new table, a
looser constraint), rolling back the code alone is safe: the old code
ignores columns it doesn't know about. Any migration that DROPS or
narrows a constraint is destructive; do not attempt to roll it back
without a restore.

## Zero-downtime upgrades

Not supported yet. The stack expects one app container at a time. If you
need HA, sit two stacks behind a load balancer and drain one at a time —
but treat the migration step as the fence: the second stack's boot will
no-op the migrate step and pick up the schema the first one already put
in place.

## Version pinning

Node 22 LTS. Postgres 17. Pinning is done in `Dockerfile` and
`docker-compose.yml` respectively; renovate/dependabot proposes the
bumps and CI catches the ones that break.
