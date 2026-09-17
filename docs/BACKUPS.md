# Backups

Two things you need to back up: the Postgres data volume and the uploads
volume. Everything else (the app image, the parser image, the code) rebuilds
from git and Docker Hub.

## What to back up, how often

| What | Frequency | Where |
|---|---|---|
| `pgdata` volume — the whole log | Daily, kept for 30 days | Off-host storage. |
| `uploads` volume — receipts and attachments | Daily, kept for 30 days | Same off-host storage. |
| `.env` (encrypted) | On every change | A password manager, not the backup target. |

The two volumes are named in `docker-compose.yml`. There is no application
state outside them — the app itself is stateless and pulled fresh.

## Daily job

Put this in the host's crontab (or a systemd timer). It runs `pg_dump` from
inside the running container, so no host-side Postgres client is needed.

```sh
#!/bin/sh
set -eu
STAMP=$(date +%Y-%m-%d)
BACKUP_DIR=/var/backups/logbook
mkdir -p "$BACKUP_DIR"

# Database, custom format so pg_restore can be selective.
docker compose exec -T db \
  pg_dump -U logbook -Fc logbook \
  > "$BACKUP_DIR/db-$STAMP.dump"

# Uploads volume, tarred and gzipped from inside a helper container so
# permissions come out right.
docker run --rm \
  -v $(docker volume inspect -f '{{.Mountpoint}}' mileagetracker_uploads):/data \
  -v "$BACKUP_DIR":/out alpine \
  tar czf "/out/uploads-$STAMP.tgz" -C /data .

# Prune anything over 30 days.
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

Then ship `$BACKUP_DIR` to an off-host destination on the same cadence
(rclone, restic, whatever you already run).

## Restore

Restore is the acceptance test for a backup you don't run regularly. Verify
it before you need it.

```sh
# 1. Bring the stack down.
docker compose down

# 2. Recreate the volumes empty.
docker volume rm mileagetracker_pgdata mileagetracker_uploads
docker compose up -d db
sleep 5   # wait for the DB to be ready

# 3. Restore the database.
cat db-$STAMP.dump | \
  docker compose exec -T db pg_restore \
  -U logbook -d logbook --clean --if-exists

# 4. Restore the uploads volume.
docker run --rm \
  -v $(docker volume inspect -f '{{.Mountpoint}}' mileagetracker_uploads):/data \
  -v $(pwd):/in alpine \
  tar xzf "/in/uploads-$STAMP.tgz" -C /data

# 5. Bring the app up.
docker compose up -d
```

## Monthly restore drill

A backup you can't restore is not a backup. Run this on the first of every
month against a scratch stack:

```sh
docker compose -p logbook-drill up -d db
# ...restore into the drill stack, run node e2e/deployed-smoke.mjs.
docker compose -p logbook-drill down -v
```

If the drill fails, fix it that day. If the drill can't run because the
smoke test has drifted from the schema, the drift is the thing to fix.

## What is NOT backed up

- The parser image: rebuilds from `parser/`.
- The app image: rebuilds from the working tree via `docker compose build`.
- Container logs: rotated by Docker itself; if they matter, ship them to
  syslog with a `logging:` block in compose.
