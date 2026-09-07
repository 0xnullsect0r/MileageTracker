#!/bin/sh
set -e

echo "logbook: applying migrations"
node /app/scripts/migrate.mjs

echo "logbook: bootstrapping admin"
node /app/scripts/bootstrap.mjs

exec "$@"
