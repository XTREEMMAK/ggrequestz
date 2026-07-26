# Local Test Environment

A disposable Docker stack for testing a **real installation** of G.G Requestz —
built from your working tree rather than pulled from GHCR — together with live
fixtures for the integrations that are difficult to reason about from
documentation alone.

## Why this exists

During the v1.3 work, three separate diagnoses made from documentation were
wrong about the actual mechanics, and each was settled in minutes by a live
instance:

- The ROMM outage was predicted to be `200` with an empty array. It is actually
  `403 {"detail":"Insufficient scope"}` from `/api/token` — authentication
  fails outright, no token is ever issued.
- The RomM response schema was assumed to have changed in 5.0. It had not; the
  parser had simply been reading fields RomM never returned.
- The OIDC redirect URI looked correct until a real provider rejected it —
  adapter-node advertises `https` when no `ORIGIN` is configured.

Reasoning about an external API from its docs produces confident wrong answers.
Run the thing.

---

## Quick start

```bash
make test-up      # build + start app, postgres, redis, RomM, Keycloak
make test-seed    # provision fixtures, print config to paste back
```

| Service  | URL                     |
| -------- | ----------------------- |
| App      | <http://127.0.0.1:3100> |
| RomM     | <http://127.0.0.1:8090> |
| Keycloak | <http://127.0.0.1:8091> |
| Postgres | `127.0.0.1:5433`        |
| Redis    | `127.0.0.1:6380`        |

Everything binds to `127.0.0.1` only, on ports chosen to avoid the defaults in
`docker-compose.yml`, so this can run alongside a normal deployment.

### Signing in

The default `AUTH_METHOD=basic` login is:

| Username | Password         |
| -------- | ---------------- |
| `admin`  | `ggr-test-admin` |

`make test-seed` creates it, via `scripts/testing/seed-app.sh`. That script posts
to the app's own first-run endpoint (`POST /api/auth/basic/setup`) rather than
inserting a row, so the password is hashed and the `admin` role assigned exactly
the way a real installation does it — a direct `INSERT` sets `is_admin` but
leaves `ggr_user_roles` empty. Re-running it is safe: the endpoint refuses a
second admin, and the script treats that as success.

Run it on its own against a stack that is already up:

```bash
./scripts/testing/seed-app.sh
```

Pass a base URL as the first argument if the app's `ORIGIN` is not the loopback
default — `checkOrigin: true` in `svelte.config.js` rejects a POST whose `Origin`
disagrees, and the script reports that case explicitly rather than looking like a
bad password.

Passwords are bcrypt cost-12 and cannot be read back, so if you change it and
lose it, hash a new one and update the row directly:

```bash
docker exec -w /app ggr-test-app-1 node -e \
  "import('bcrypt').then(async b => console.log(await b.default.hash('NEW-PASSWORD', 12)))"
docker exec ggr-test-postgres-1 psql -U ggrequestz -d ggrequestz \
  -c "UPDATE ggr_users SET password_hash = '<hash>' WHERE username = 'admin';"
```

`hashPassword` rejects anything shorter than 8 characters.

### Reaching the stack from another machine

The published ports are loopback-only by default. To test from a browser on a
different host, set the bind address **and** the origin host — `adapter-node`
rejects POSTs whose `Origin` header does not match, so the login form fails with
a 403 if only the bind address changes:

```bash
GGR_TEST_HOST=0.0.0.0 GGR_TEST_ORIGIN_HOST=<lan-ip> \
  docker compose -f docker-compose.test.yml up -d app
```

Keycloak and Authentik stay on loopback, so OIDC logins need the same treatment
plus a re-run of `scripts/testing/seed-keycloak.sh` to re-register the redirect
URI.

```bash
make test-logs              # follow everything
make test-logs SERVICE=app  # just the app
make test-shell             # shell into the app container
make test-down              # stop and delete volumes
```

---

## Reconfiguring the app

`make test-seed` prints ready-to-use environment blocks. Export the ones you
want and restart just the app:

```bash
export ROMM_SERVER_URL=http://romm:8080
export ROMM_API_TOKEN=rmm_...
docker compose -f docker-compose.test.yml --profile romm --profile oidc up -d app
```

> **Internal vs public hostnames.** Server-side calls use the compose service
> name (`http://romm:8080`, `http://keycloak:8080`). Only values the _browser_
> follows — `OIDC_REDIRECT_URI`, `PUBLIC_SITE_URL` — use `127.0.0.1`. A public
> URL for a server-side call hairpins out through DNS, TLS and the reverse
> proxy and back, which is precisely the cost v1.3 removed from the render path.

---

## Fixture states

### RomM

`scripts/testing/seed-romm.sh` creates three testable states:

| State                   | Config                                  | Expected                               |
| ----------------------- | --------------------------------------- | -------------------------------------- |
| Healthy, API token      | `ROMM_API_TOKEN=rmm_…`                  | Library renders                        |
| Healthy, password grant | `ROMM_USERNAME/PASSWORD` for `ggradmin` | Library renders (RomM 4.x path)        |
| **Broken**              | `ROMM_USERNAME/PASSWORD` for `lowpriv`  | 403, error state in UI, remedy in logs |

The broken state reproduces the real outage. Expect:

```
🚫 ROMM refused to issue a token: the account lacks the 'roms.read' scope...
⚠️ ROMM availability probe failed (http_403)
```

Notes that cost time to work out:

- RomM enforces **CSRF** on writes — fetch the `romm_csrftoken` cookie and echo
  it in an `x-csrftoken` header.
- The first admin can be created **unauthenticated** while the setup wizard is
  active; everything after needs `Authorization: Bearer`.
- **Role alone does not revoke library access.** RomM coerces `viewer` to
  `user`, and that role still carries `roms.read`. Use the 5.0 permission API:
  `PUT /api/permissions/users/{id}` with
  `{"overrides":[{"entity":"roms","action":"read","granted":false}]}`.
- Client API Tokens return the secret **once**, in `raw_token`.

### Keycloak

`scripts/testing/seed-keycloak.sh` creates a confidential client and a test
user. Keycloak is deliberately the OIDC fixture because its endpoint paths
(`/realms/{r}/protocol/openid-connect/auth`) share nothing with Authentik's
(`/application/o/authorize/`) — so it catches any regression back toward
provider-specific assumptions.

Keycloak does **not** emit a `groups` claim without an explicit Group Membership
mapper. That is the case v1.3 fixed: an absent claim no longer clears `is_admin`
on every login. Add the mapper and set `OIDC_SCOPES` / `OIDC_ROLE_MAP` to
exercise role mapping.

### Authentik (upgrade path)

```bash
docker compose -f docker-compose.test.yml --profile authentik up -d
```

Available at <http://127.0.0.1:9000>, bootstrapped as `akadmin` /
`AkAdminPass123!` with API token `ggr-bootstrap-token-for-testing`.

Use this to verify the **pre-1.3 configuration still works** — set only
`AUTH_METHOD=authentik` and `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET` /
`AUTHENTIK_ISSUER`, with no `OIDC_*` at all. The login button should still read
"Login with Authentik".

The Authentik API needs `Accept: application/json`; without it, requests that
would otherwise succeed return `403`.

---

## Things worth checking here

- **Cold start.** Point `ROMM_SERVER_URL` at an unroutable address
  (`https://10.255.255.1`) and measure `/login`. TTFB must not move — that is
  the regression test for the v1.3 cold-start fix.
  ```bash
  curl -w "%{time_starttransfer}\n" -o /dev/null -s http://127.0.0.1:3100/login
  ```
- **Server logs exist at all.** `drop_console` previously stripped every
  server-side `console.*` from production builds. If logs go quiet, check
  `vite.config.js` first.
- **Node parity.** The image runs Node 22, matching what `npm run build` uses
  locally. Before v1.3 the image was Node 18 while development ran newer, so
  APIs could work locally and fail in the container.

---

## Notes

- The stack is disposable. `make test-down` deletes its volumes; re-seed after.
- `tmp/test-fixtures/` holds the RomM library and asset mounts. Drop ROM files
  into `tmp/test-fixtures/romm-library/roms/` and rescan in RomM to populate the
  library. `tmp/` is gitignored.
- PM2 runs one worker per core, and each worker warms its own cache at boot, so
  the startup logs repeat per worker. That is expected — but note it means N
  parallel IGDB warm-ups on an N-core host.
