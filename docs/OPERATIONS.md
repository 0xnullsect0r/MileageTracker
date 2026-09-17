# Operations

Everything you need to run this on your own server. For upgrade steps see
`UPGRADING.md`; for backups see `BACKUPS.md`.

## Reverse proxy

The app expects to sit behind an HTTPS-terminating reverse proxy. It
publishes port 3000 on the host; wire that to your proxy of choice.

### Caddy

```caddy
logbook.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Caddy sets `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`
by default, which is what `TRUST_PROXY=true` expects.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name logbook.example.com;
    ssl_certificate     /etc/letsencrypt/live/logbook.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logbook.example.com/privkey.pem;

    client_max_body_size 40M;  # matches MAX_UPLOAD_MB + a little

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

The application-side `Content-Security-Policy` and `Strict-Transport-Security`
headers are set by `src/proxy.ts`. Do not overwrite them at the proxy layer;
merge if you must, but the app-side values are the ones under CI.

## Rotating SESSION_SECRET

Rotating the secret does not invalidate cookies — cookies carry a token, the
DB stores its hash, and the secret is used only for other primitives. If you
have to invalidate every session (for example, a compromise):

```sh
docker compose exec db psql -U logbook -d logbook -c "delete from sessions;"
```

Then rotate `SESSION_SECRET` in `.env` for defence-in-depth, and restart.

## Bulk-adding users

There is no bulk import UI. A one-off script under `scripts/` is the right
shape; open a PR if you find yourself doing it repeatedly. Meanwhile:

```sh
docker compose exec app node -e "
  import('./node_modules/@node-rs/argon2/index.js').then(async ({ hash }) => {
    // ...loop, insert into users, print the temporary passwords.
  });
"
```

Every user created by any path is set to `mustChangePassword=true`, so a
handover password is short-lived by design.

## Environment variables

Set every one of these in `.env`. The bootstrap step refuses to start under
`NODE_ENV=production` if any of them are still the `.env.example` defaults.

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Database password. Long-random. |
| `SESSION_SECRET` | `openssl rand -base64 48`. Never reuse across environments. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First administrator, created on first boot. First sign-in forces a password change. |
| `APP_PORT` | Host port for your proxy. Default `3000`. |
| `TRUST_PROXY` | `true` when the proxy sets X-Forwarded-*. Default `true`. |
| `COOKIE_SECURE` | `false` only for plain-HTTP LAN. HSTS is skipped when set. |
| `MAX_UPLOAD_MB` | Upload ceiling for `.numbers` imports. Attachments are separately capped at 10 MB. |
| `TZ` | Server timezone. Affects "last month" and "today" for reports. |

## Logs

The app writes JSON to stdout via `src/lib/log.ts`. Docker collects it. To
ship it somewhere, add a `logging:` block to `docker-compose.yml`:

```yaml
logging:
  driver: journald   # or fluentd, gelf, awslogs, …
  options:
    tag: logbook
```

Never log request bodies, cookies, entry descriptions, or user emails.
Actor id is fine.

## Health

- `GET /api/health` — cheap: replies `{status, db}` after a `SELECT 1`. The
  docker healthcheck uses this.
- `GET /api/health?deep=1` — also pings the parser sidecar and reports the
  current migration head. Use this in an external monitor, not in docker's
  own healthcheck.

## Runbook: quick triage

- **App is 502.** Compose is up but the app can't reach Postgres — check
  `docker compose logs db` and `docker compose logs app | head -50`.
- **Uploads fail with "Only JPEG…".** The file's contents aren't in the
  allowlist. Check with `file <upload>`; if it really is a PDF but is being
  refused, look for a corrupted or truncated file.
- **Sessions all expired at once.** Someone rotated `SESSION_SECRET` and
  cleared `sessions`. Expected.
- **`bootstrap: refusing to start with insecure defaults`.** `.env` still
  has `change-me` / `you@example.com`. Fix and restart.
- **Migration lock stuck.** `docker compose exec db psql -U logbook -c
  "select pg_advisory_unlock_all();"`, then restart the app.
