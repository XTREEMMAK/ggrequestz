# CLAUDE.md

Working agreements for this repository. Read before making changes.

---

## Commit discipline

**One logical change per commit.** This is the rule that matters most here, because the repo has a history of violating it:

```
687aef7 Release v1.2.5: Global content filtering and critical bug fixes
bf494c2 Release v1.2.3: Critical security fixes and granular permissions
b6b29a7 Complete UI improvements from previous session
```

Commits like these make it impossible to bisect a regression, revert one bad change without losing four good ones, or review anything meaningfully.

**Required:**

- One task, one commit. A bug fix and the refactor that enabled it are two commits.
- Never bundle unrelated fixes under a release heading. "Release vX.Y.Z" is a **tag**, not a commit message. The only thing a release commit should contain is the version bump and changelog entry.
- Formatting-only changes (`npm run format`) go in their own commit, never mixed with logic.
- If a change touches multiple workstreams, split it — even when the work happened in one sitting.

**Format:** [Conventional Commits](https://www.conventionalcommits.org/), as already specified in `CONTRIBUTING.md`.

```
feat: add OIDC discovery document support
fix: add timeout to ROMM authentication request
docs: rewrite OIDC setup guide for generic providers
refactor: consolidate duplicate ROMM fetch implementations
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

Branches: `feature/`, `fix/`, `docs/`, `refactor/`, `test/` + description.

---

## Before committing

```bash
npm run lint        # prettier --check .
npm run check       # svelte-check
npm run test:unit   # vitest run
```

Run `npm run format` if lint fails — but commit the formatting separately from the logic change.

---

## Changelog

`CHANGELOG.md` follows Keep a Changelog structure with **emoji section headers** in practice:

```markdown
## [1.3.0] - 2026-07-25

### ✨ New Features

### 🐛 Bug Fixes

### 🔧 Technical Changes

### 📚 Documentation
```

> Note: `docs/guides/RELEASE_GUIDE.md:26-40` documents plain `### Added / Changed / Fixed` headers. The file itself uses emoji. The docs are out of date; follow the file.

**The `## [X.Y.Z]` heading is load-bearing** — `.github/workflows/release.yml:46-50` extracts release notes from it with `awk`, and `scripts/create-release.sh:43` gates on `grep -q "^## \[$version\]"`. Do not reformat it.

Keep an empty `## [Unreleased]` section at the top.

---

## Stack

SvelteKit 2 + Svelte 5 (runes) · `@sveltejs/adapter-node` · PostgreSQL via raw `pg` (no ORM) · Redis via `node-redis` with in-memory fallback · `jose` for session JWTs · PM2 cluster in Docker.

New components use **runes** (`$state`, `$props`, `$derived`). Some older components still use Svelte 4 syntax (`export let`) — migrate them when you touch them.

Server-only modules end in `.server.js` or live under `src/lib/server/`.

---

## Server-side performance rules

These exist because v1.3 fixed a 9-second cold-start hang caused by breaking them. See `tmp/1.3-phase-A-cold-start.md`.

1. **No outbound HTTP on the root layout.** `src/routes/+layout.server.js` runs on _every_ route, including the unauthenticated `/login`. Anything awaited there blocks the first byte of every page. Use config checks and background-refreshed values instead.
2. **Every outbound call gets a hard timeout.** `AbortSignal.timeout(...)` on every `fetch`, no exceptions. Nothing on a render path may block unbounded.
   - `AbortSignal.timeout()` throws **`TimeoutError`**, not `AbortError`. Check accordingly.
3. **Never swallow an error silently.** A `catch` that returns `[]`, `null`, or `false` without logging destroys the ability to diagnose anything. Log the status code. Distinguish 403 from timeout from empty.
4. **Nothing expensive on the request path at boot.** Cache warming, migrations, and pool construction happen at startup, out of band.
5. **Slow data streams.** Return unawaited promises from `load` and render skeletons, rather than blocking SSR.
   - ⚠️ Streaming needs CSP `mode: "nonce"` in `svelte.config.js`. Under `"hash"`, streamed inline `<script>` chunks are emitted after headers flush, get blocked, and the sections never resolve. Note that while `'unsafe-inline'` stays in `script-src`, SvelteKit emits neither hashes nor nonces, so the mode is inert — but it must be correct before `'unsafe-inline'` is removed.
6. **Never strip `console` from the server bundle.** `drop_console` in `vite.config.js` applies to the SSR build too. Operators of a self-hosted app debug from container logs; silently removing every log statement is how integrations fail invisibly.
7. **Prefer internal service hostnames** over public URLs for server-side calls. A public URL hairpins out through DNS + TLS + the reverse proxy and back.

---

## Database & migrations

Migrations live in `migrations/`, run via `scripts/database/db-manager.js`, tracked by **filename** in `ggr_migrations`, ordered lexicographically.

```bash
npm run db:migrate
npm run db:status
```

Known limitations — do not rely on these working:

- `ggr_schema_version` and `ggr_migration_lock` exist but are **never read by any code**. There is no version-delta upgrade path.
- `rollback_sql` is stored but never executed.
- `scripts/deployment/docker-entrypoint.js` will **drop and recreate** `ggr_migrations` if it detects an unexpected column shape, losing history.

New migrations: `NNN_description.sql`, next number in sequence. Never edit a migration that has shipped.

---

## Environment variables

`.env.example` is the source of truth for what exists. When adding a variable, update **all** of:
`.env.example` · `docker-compose.yml` · `docs/CONFIGURATION.md` · the relevant setup guide in `docs/setup/`

Prefer reading env through `$env/dynamic/private`. Note that `src/lib/auth.server.js` reads at module top-level, so those values freeze at first import.

---

## Documentation

`docs/` is organized as `setup/`, `guides/`, `dev-notes/`, plus top-level `ARCHITECTURE.md`, `API.md`, `CONFIGURATION.md`.

**Docs must describe shipped behavior.** `docs/setup/OIDC_SETUP.md` previously documented eight `OIDC_*` variables that no code read, which produced two user-facing bug reports (#4, #7). If a feature is planned but not implemented, say so explicitly.

---

## Planning records

Multi-phase work is tracked in `tmp/` — one document per workstream, with evidence and a task checklist. See `tmp/1.3 Update and bugs.md` and the `tmp/1.3-phase-*.md` records for the format.
