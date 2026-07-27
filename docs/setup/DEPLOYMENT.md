# Production Deployment

Running G.G Requestz behind a reverse proxy, with the settings that are easy to
get wrong. For a first install, start with [QUICKSTART.md](../../QUICKSTART.md)
— this guide covers what comes after it works on localhost.

## What the stack is

`docker compose up -d` starts three containers and nothing else:

| Service      | Image                                 | Purpose                                |
| ------------ | ------------------------------------- | -------------------------------------- |
| `ggrequestz` | `ghcr.io/xtreemmak/ggrequestz:latest` | The app, under PM2 in cluster mode     |
| `postgres`   | `postgres:15-alpine`                  | Required                               |
| `redis`      | `redis:7-alpine`                      | Optional; in-memory fallback if absent |

There is no bundled reverse proxy and no TLS termination. Compose defines no
profiles — `--profile anything` is a no-op left over from an older layout.

## Set ORIGIN, or logins will fail

This is the single most common production breakage.

`adapter-node` rejects any form POST whose `Origin` header disagrees with the
app's configured origin, and when nothing is configured it assumes `https`.
Behind a proxy that terminates TLS and forwards plain HTTP, that assumption is
wrong in both directions: GET requests work fine, so the site looks healthy,
but every login and every form submission fails with **"Cross-site POST form
submissions are forbidden"**.

```bash
PUBLIC_SITE_URL=https://requests.example.com
ORIGIN=https://requests.example.com
```

The entrypoint derives `ORIGIN` from `PUBLIC_SITE_URL` when it is unset, so
setting `PUBLIC_SITE_URL` correctly is usually enough. Set both if you are
unsure. The same value must match the redirect URI registered at your OIDC
provider — see [OIDC_SETUP.md](OIDC_SETUP.md).

## Reverse proxy

Forward to the app's published port (`APP_PORT`, default `3000`) and pass the
real protocol through.

### Caddy

```caddyfile
requests.example.com {
    reverse_proxy localhost:3000
}
```

Caddy sets `X-Forwarded-Proto` and obtains certificates automatically; nothing
else is needed.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name requests.example.com;

    ssl_certificate     /etc/letsencrypt/live/requests.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/requests.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cover art and IGDB responses can be large
        proxy_read_timeout 60s;
    }
}
```

### Traefik

Earlier versions of this guide described a bundled Traefik service enabled with
`--profile proxy`, plus `DOMAIN` and `ACME_EMAIL` variables. None of that
exists. Run Traefik as your own stack and route to the container over an
external network.

## Hardening before you expose it

**Generate real secrets.** The app refuses to start without `SESSION_SECRET` —
that is deliberate, since it used to fall back to a placeholder committed to
this repository, which made session cookies forgeable.

```bash
openssl rand -hex 32     # SESSION_SECRET
openssl rand -base64 32  # POSTGRES_PASSWORD
```

**Stop publishing the database port.** `docker-compose.yml` maps Postgres to
the host so it is reachable during a first install. In production, delete the
`ports:` block from the `postgres` service — the app reaches it over the
Compose network regardless. Same for `redis`.

**Check that a reverse proxy is the only public path.** With `APP_PORT` bound
on `0.0.0.0`, port 3000 is reachable directly and bypasses whatever your proxy
enforces. Bind it to loopback:

```yaml
ports:
  - "127.0.0.1:${APP_PORT:-3000}:3000"
```

## Scaling

The app runs under PM2 in cluster mode. `PM2_INSTANCES` defaults to `max`, one
worker per core.

```bash
PM2_INSTANCES=4          # pin the worker count
PM2_CRON_RESTART=0 4 * * *   # optional nightly recycle
```

Watch the connection maths: `POSTGRES_POOL_MAX` is **per worker**, so `max` on
a 16-core host with the default pool of 10 will try to open 160 connections
against Postgres's default `max_connections` of 100. Either pin
`PM2_INSTANCES`, lower `POSTGRES_POOL_MAX`, or raise `max_connections`.

Redis is worth running for more than caching once you scale out: without it
each PM2 worker keeps its own in-memory cache, so hit rates fall roughly in
proportion to worker count.

```bash
docker compose exec ggrequestz pm2 status
docker compose exec ggrequestz pm2 monit
```

## Health and logs

```bash
curl -f http://localhost:3000/api/health
docker compose ps                       # container health checks
docker compose logs -f --tail=100 ggrequestz
```

The container health check runs `scripts/healthcheck.cjs` every 30s after a 30s
start period.

Server-side `console` output is deliberately **not** stripped from the
production bundle. Operators of a self-hosted app debug from container logs, so
integration failures — a ROMM 403, an OIDC discovery timeout — are visible
there and nowhere else. Read them after any upgrade.

## Backups

```bash
docker compose exec -T postgres pg_dump -U postgres ggrequestz > "backup_$(date +%F).sql"
```

Weekly, with 30-day retention:

```cron
0 2 * * 0 cd /srv/ggrequestz && docker compose exec -T postgres pg_dump -U postgres ggrequestz > "/backup/ggr_$(date +\%F).sql" && find /backup -name 'ggr_*.sql' -mtime +30 -delete
```

Postgres is the only stateful service worth backing up. Redis holds cache only,
and the `ggrequestz-logs` volume holds logs.

## Upgrading

```bash
docker compose exec -T postgres pg_dump -U postgres ggrequestz > backup_pre_upgrade.sql
docker compose pull
docker compose up -d
docker compose logs -f ggrequestz | grep -iE "schema|migration|error"
```

Migrations run automatically at boot unless `AUTO_MIGRATE=false`. There is **no
rollback path** — `rollback_sql` is recorded but never executed — so the dump
above is the only way back. Schema mismatches are logged rather than fatal, so
the app starting is not by itself proof the upgrade succeeded; read the logs.

Check [CHANGELOG.md](../../CHANGELOG.md) for breaking changes first. Upgrading
to 1.3.0 in particular requires `SESSION_SECRET` to be set, and invalidates
existing basic-auth sessions once.

Roll one instance at a time if you run several — migrations are not serialised
between concurrently booting containers.

## Troubleshooting

**"Cross-site POST form submissions are forbidden"**
`ORIGIN` / `PUBLIC_SITE_URL` do not match the URL users actually visit. See
above.

**Login redirects to the provider and comes back rejected**
The redirect URI the app advertises differs from the one registered, usually
`http` vs `https`. Set `OIDC_REDIRECT_URI` explicitly.

**Site loads, ROMM covers and "Play in ROMM" links are broken**
`ROMM_SERVER_URL` is an address only the server can resolve. Set
`ROMM_SERVER_URL_PUBLIC` to the browser-facing URL — see
[INTEGRATIONS.md](../guides/INTEGRATIONS.md).

**Container restarts in a loop**
Almost always a missing `SESSION_SECRET` or an unreachable database.
`docker compose logs ggrequestz` says which.

**High memory use**
Each PM2 worker is a full Node process. Pin `PM2_INSTANCES` lower, and add a
memory limit:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
```

## Related

- [CONFIGURATION.md](../CONFIGURATION.md) — every environment variable
- [DATABASE_SETUP.md](DATABASE_SETUP.md) — migrations, pooling, backups
- [OIDC_SETUP.md](OIDC_SETUP.md) — SSO and redirect URIs
- [TESTING.md](TESTING.md) — disposable stack for rehearsing an upgrade
