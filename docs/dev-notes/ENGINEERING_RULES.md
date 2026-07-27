# Engineering rules

Constraints that are not obvious from reading the code, and cost real incidents
when broken. Read before making changes.

[CONTRIBUTING.md](../../CONTRIBUTING.md) covers process — how to open a PR, how
to run the suite. This file covers the things the codebase itself will not tell
you.

---

## Stack

SvelteKit 2 + Svelte 5 (runes) · `@sveltejs/adapter-node` · PostgreSQL via raw
`pg` (no ORM) · Redis via `node-redis` with in-memory fallback · `jose` for
session JWTs · PM2 cluster in Docker.

New components use **runes** (`$state`, `$props`, `$derived`). Some older
components still use Svelte 4 syntax (`export let`) — migrate them when you
touch them.

Server-only modules end in `.server.js` or live under `src/lib/server/`.

---

## Server-side performance rules

These exist because v1.3 fixed a 9-second cold-start hang caused by breaking
them. See [V1.3_FINDINGS.md](V1.3_FINDINGS.md).

1. **No outbound HTTP on the root layout.** `src/routes/+layout.server.js` runs
   on _every_ route, including the unauthenticated `/login`. Anything awaited
   there blocks the first byte of every page. Use config checks and
   background-refreshed values instead.

2. **Every outbound call gets a hard timeout.** `AbortSignal.timeout(...)` on
   every `fetch`, no exceptions. Nothing on a render path may block unbounded.
   - `AbortSignal.timeout()` throws **`TimeoutError`**, not `AbortError`. Check
     accordingly. `isTimeoutOrNetworkError()` in `src/lib/utils.js` gets this
     right; use it rather than writing the check again.

3. **Never swallow an error silently.** A `catch` that returns `[]`, `null`, or
   `false` without logging destroys the ability to diagnose anything. Log the
   status code. Distinguish 403 from timeout from empty.

4. **Nothing expensive on the request path at boot.** Cache warming, migrations,
   and pool construction happen at startup, out of band.

5. **Slow data streams.** Return unawaited promises from `load` and render
   skeletons, rather than blocking SSR.
   - ⚠️ Streaming needs CSP `mode: "nonce"` in `svelte.config.js`. Under
     `"hash"`, streamed inline `<script>` chunks are emitted after headers flush,
     get blocked, and the sections never resolve. Note that while
     `'unsafe-inline'` stays in `script-src`, SvelteKit emits neither hashes nor
     nonces, so the mode is inert — but it must be correct before
     `'unsafe-inline'` is removed.

6. **Never strip `console` from the server bundle.** `drop_console` in
   `vite.config.js` applies to the SSR build too. Operators of a self-hosted app
   debug from container logs; silently removing every log statement is how
   integrations fail invisibly.

7. **Prefer internal service hostnames** over public URLs for server-side calls.
   A public URL hairpins out through DNS + TLS + the reverse proxy and back.

### Cached credentials need an expiry

Any credential held in module scope must track when it dies and renew ahead of
that, and must be discarded on _any_ response that suggests it is stale — not
just the status code the provider's documentation promises.

The ROMM client learned this the expensive way: it cached a bearer token with no
expiry and cleared it only on an exact `401`. RomM answers a request carrying an
expired JWT with **500**, so the token was never discarded and each worker
served errors until the container was restarted. See
`src/lib/romm.server.js` and `tests/integration/romm-token-lifecycle.test.js`.

Module state is also **per PM2 worker**. A cache, token, or circuit breaker held
in a module is not shared, so N workers means N copies with independent
lifetimes. Anything that must be shared goes through Redis.

---

## Database & migrations

Migrations live in `migrations/`, run via `scripts/database/db-manager.js`,
tracked by **filename** in `ggr_migrations`, ordered lexicographically.

```bash
npm run db:migrate
npm run db:status
```

Known limitations — do not rely on these working:

- `ggr_schema_version` and `ggr_migration_lock` are created by
  `001_initial_schema.sql` but are **never read by any code**. There is no
  version-delta upgrade path, and no locking — concurrent migration runs are not
  serialised.
- `rollback_sql` is stored but never executed.
- `verifySchemaIntegrity()` in `db-manager.js` **does not throw**. A schema
  mismatch logs to stderr and the app boots anyway, on the grounds that an
  instance which refuses to start is harder to repair than one running degraded.
  Check container logs after upgrading.

New migrations: `NNN_description.sql`, next number in sequence. Never edit a
migration that has shipped.

Migrations create the schema and the system roles and permissions, but **no
domain data**. A freshly migrated database has no users and no games; see
[../setup/TESTING.md](../setup/TESTING.md) for seeding one.

---

## Environment variables

`.env.example` is the source of truth for what exists. When adding a variable,
update **all** of:

`.env.example` · `docker-compose.yml` · `docs/CONFIGURATION.md` · the relevant
setup guide in `docs/setup/`

Prefer reading env through `$env/dynamic/private`. Note that
`src/lib/auth.server.js` reads at module top-level, so those values freeze at
first import.

**Docker Compose reads `./.env` for `${VAR:-default}` interpolation**, whether
or not a compose file asks it to. This is why `docker-compose.test.yml` is run
with `--env-file /dev/null`: without it, the disposable test stack silently
inherited the production `AUTH_METHOD`, `SESSION_SECRET` and `ROMM_SERVER_URL`.

---

## Commit discipline

**One logical change per commit.** This is the rule that matters most here,
because the repo has a history of violating it:

```
687aef7 Release v1.2.5: Global content filtering and critical bug fixes
bf494c2 Release v1.2.3: Critical security fixes and granular permissions
b6b29a7 Complete UI improvements from previous session
```

Commits like these make it impossible to bisect a regression, revert one bad
change without losing four good ones, or review anything meaningfully.

- One task, one commit. A bug fix and the refactor that enabled it are two
  commits.
- Never bundle unrelated fixes under a release heading. "Release vX.Y.Z" is a
  **tag**, not a commit message. The only thing a release commit should contain
  is the version bump and changelog entry.
- Formatting-only changes (`npm run format`) go in their own commit, never mixed
  with logic.
- If a change touches multiple workstreams, split it — even when the work
  happened in one sitting.

**Format:** [Conventional Commits](https://www.conventionalcommits.org/).

```
feat: add OIDC discovery document support
fix: add timeout to ROMM authentication request
docs: rewrite OIDC setup guide for generic providers
refactor: consolidate duplicate ROMM fetch implementations
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Branches: `feature/`, `fix/`, `docs/`, `refactor/`, `test/` + description.

### Before committing

```bash
npm run lint            # prettier --check .
npm run check           # svelte-check
npm run test:unit       # vitest, jsdom project
npm run test:integration # vitest, node project
```

Run `npm run format` if lint fails — but commit the formatting separately from
the logic change.

---

## Changelog

`CHANGELOG.md` follows Keep a Changelog structure with **emoji section headers**
in practice:

```markdown
## [1.3.0] - 2026-07-25

### ✨ New Features

### 🐛 Bug Fixes

### 🔧 Technical Changes

### 📚 Documentation
```

> `docs/guides/RELEASE_GUIDE.md` documents plain `### Added / Changed / Fixed`
> headers. The file itself uses emoji. The docs are out of date; follow the file.

**The `## [X.Y.Z]` heading is load-bearing** — `.github/workflows/release.yml`
extracts release notes from it with `awk`, and `scripts/create-release.sh` gates
on `grep -q "^## \[$version\]"`. Do not reformat it.

Keep an empty `## [Unreleased]` section at the top.

---

## Documentation

`docs/` is organised as `setup/`, `guides/`, `dev-notes/`, plus top-level
`ARCHITECTURE.md`, `API.md`, `CONFIGURATION.md`. The index lives in the root
`README.md`, which is the only documentation file at the repository root.

**Docs must describe shipped behavior.** `docs/setup/OIDC_SETUP.md` previously
documented eight `OIDC_*` variables that no code read, which produced two
user-facing bug reports (#4, #7). If a feature is planned but not implemented,
say so explicitly.

---

## Planning records

Multi-phase work is tracked in `tmp/` — one document per workstream, with
evidence and a task checklist. `tmp/` is **not** tracked in git, so these records
are local to whoever did the work.

When a workstream finishes, the durable findings move into `docs/dev-notes/` and
the working record stays behind. [V1.3_FINDINGS.md](V1.3_FINDINGS.md) is the
worked example, distilled from six `tmp/1.3-*.md` records.
