# Testing

How this project is tested, and how to bring up an instance to test against.

## The four layers

| Layer           | Command                                 | Runner     | Needs                     |
| --------------- | --------------------------------------- | ---------- | ------------------------- |
| **Unit**        | `npm run test:unit`                     | Vitest     | nothing                   |
| **Integration** | `npm run test:integration`              | Vitest     | nothing (fetch is mocked) |
| **End-to-end**  | `npm run test:e2e`                      | Playwright | `make test-seeded`        |
| **Manual**      | `make test-blank` / `-seeded` / `-live` | Docker     | Docker                    |

`npm run test:all` runs the first three in order.

**Unit** (`src/tests/unit/`) covers pure functions in a jsdom environment.
**Integration** (`tests/integration/`) covers server-side modules in a node
environment — server code branches on `browser`, so it cannot be exercised
correctly under a DOM. Both are Vitest _projects_, declared in
`vitest.config.js`; `--project unit` or `--project integration` selects one.

Neither reaches the network. The ROMM client tests, for example, drive a mocked
`fetch`, so the whole suite runs offline and in CI with no services.

**End-to-end** drives a real browser against a real installation. Locally that
is the Docker test stack, never `npm run dev` — the dev server loads
`.env.development`, which usually points at a database you care about. A
`globalSetup` refuses to run if the stack is not up. First run also needs the
browsers:

```bash
npx playwright install     # once; CI does this itself
make test-seeded
npm run test:e2e
```

---

## The disposable stack

A **real installation** of G.G Requestz — built from your working tree rather
than pulled from GHCR — together with live fixtures for the integrations that
are difficult to reason about from documentation alone.

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

## Three modes

Pick by what you are testing. Each starts from a deleted volume, so switching
between them is just running the other target.

| Command            | State                                               | Lands on | For                                        |
| ------------------ | --------------------------------------------------- | -------- | ------------------------------------------ |
| `make test-blank`  | schema and system roles only — no admin, no data    | `/setup` | the first-run wizard, fresh-install checks |
| `make test-seeded` | admin, 30 games, requests, watchlist, fixtures      | `/login` | everything else, and the e2e suite         |
| `make test-live`   | seeded, plus real IGDB/ROMM credentials from `.env` | `/login` | exercising the live integrations           |

**`test-blank` is the only way to see the setup wizard.** Creating an admin ends
that state permanently for the volume, which is why seeding is a separate mode
rather than a step. Do not run `make test-seed` against a blank stack unless you
mean to end it.

Two things about `test-blank` worth knowing:

- It must run with `AUTH_METHOD=basic`. Under `authentik` the root layout
  hardcodes `needsSetup = false` and the wizard never appears at all.
- The stack runs `docker compose --env-file /dev/null`. Compose otherwise reads
  the repo `.env` for `${VAR:-default}` interpolation, which silently gave the
  "disposable" stack the production `AUTH_METHOD`, `SESSION_SECRET` and
  `ROMM_SERVER_URL`. `test-live` opts back in deliberately, and
  `docker-compose.test.live.yml` pins the database and session secret back to
  the throwaway values.

### What `test-seeded` puts in the database

`scripts/testing/seed-data.js`, offline and idempotent:

| Fixture             | Detail                                                            |
| ------------------- | ----------------------------------------------------------------- |
| 30 games            | `tests/fixtures/games.json`, synthetic `99xxxx` IGDB ids          |
| 2 non-admin users   | `player` (user), `curator` (manager) — both `ggr-test-user`       |
| 5 requests          | one per status: pending, approved, rejected, fulfilled, cancelled |
| 8 watchlist entries | split across the two users                                        |
| 1 custom nav link   | for the role-visibility logic in `guides/NAVIGATION.md`           |

The ids are synthetic so fixtures can never be mistaken for real cached IGDB
records. The script refuses to run against a database holding anything else,
unless given `--force`, and it does not read the repo `.env`.

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

The default `AUTH_METHOD=basic` logins are:

| Username  | Password         | Role    |
| --------- | ---------------- | ------- |
| `admin`   | `ggr-test-admin` | admin   |
| `player`  | `ggr-test-user`  | user    |
| `curator` | `ggr-test-user`  | manager |

The form field takes either the username or the email.

`make test-seeded` creates the admin via `scripts/testing/seed-app.sh`. That script posts
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

`make test-seeded` prints ready-to-use environment blocks. Export the ones you
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

## Version-upgrade integrity test

A separate, isolated stack (`docker-compose.test.upgrade.yml`, project name
`ggr-upgrade`) for verifying that a database created by a past release upgrades
cleanly to this working tree — migrations apply in the right order, nothing
gets re-run, and existing data survives.

```bash
make test-upgrade-old FROM=v1.2.5   # builds the tagged release via a git worktree
# sign up, create a request/watchlist entry/setting through the UI
make test-upgrade-new               # swaps to this working tree, same database
# check the migration log and re-verify the data
make test-upgrade-down              # tears down and removes the worktree
```

Both legs run on port `3200` and share the same Postgres 15 volume — only the
app container is rebuilt between them, so the "upgrade" is exactly what a real
one is: new code, old data. `FROM` accepts any tag; it defaults to `v1.2.5`.

Watch `docker logs ggr-upgrade-app` for the migration sequence:

```
⏭️  Skipping 001_initial_schema.sql (already executed)
⏭️  Skipping 002_complete_schema_updates.sql (already executed)
🔄 Running migration: 008_add_animated_background_preference.sql
```

If a future release adds migrations beyond `008`, expect exactly the new ones
to run — anything already recorded in `ggr_migrations` at the old version
should be skipped, never re-executed. Compare `executed_at` timestamps for the
pre-existing rows before and after to confirm nothing touched them.

This is separate from `test-blank`/`test-seeded`/`test-live` on purpose — it
runs on Postgres 15, matching what a real release actually ships, rather than
the 16 used by the disposable stack, and it is the only mode that runs code
from anywhere other than the current working tree.

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

- The stack is disposable. `make test-down` deletes its volumes; the mode
  targets do this for you before bringing a stack up.
- `tmp/test-fixtures/` holds the RomM library and asset mounts. Drop ROM files
  into `tmp/test-fixtures/romm-library/roms/` and rescan in RomM to populate the
  library. `tmp/` is gitignored.
- PM2 runs one worker per core, and each worker warms its own cache at boot, so
  the startup logs repeat per worker. That is expected — but note it means N
  parallel IGDB warm-ups on an N-core host.
  Genuinely _identical_ duplicate lines are a different problem, and were caused
  by `out_file: /dev/stdout` in `ecosystem.config.cjs` racing pm2-runtime's own
  tail. If they come back, look there before counting workers.
