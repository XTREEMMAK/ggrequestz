# Database Setup

G.G Requestz stores everything in a single PostgreSQL database, accessed
through the `pg` driver directly. There is no ORM. All tables carry a `ggr_`
prefix so the app can share a database with other software.

> **Changed in v1.3.** Earlier versions of this guide described a Supabase
> cloud project and told you to set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
> `SUPABASE_SERVICE_KEY`. **No code reads those three variables.** The app has
> always connected over plain `POSTGRES_*` settings. `scripts/database/db-manager.js`
> still accepts `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`,
> `SUPABASE_DB_USER` and `SUPABASE_DB_PASSWORD` as fallbacks, but they are
> legacy aliases for the `POSTGRES_*` values and are not the documented path.

## Connection settings

| Variable            | Description                       | Default      | Required |
| ------------------- | --------------------------------- | ------------ | -------- |
| `POSTGRES_HOST`     | Hostname                          | `postgres`   | Yes      |
| `POSTGRES_PORT`     | Port                              | `5432`       | Yes      |
| `POSTGRES_DB`       | Database name                     | `ggrequestz` | Yes      |
| `POSTGRES_USER`     | User                              | `postgres`   | Yes      |
| `POSTGRES_PASSWORD` | Password                          | -            | **Yes**  |
| `POSTGRES_POOL_MAX` | Pool size, **per PM2 worker**     | `10`         | No       |
| `AUTO_MIGRATE`      | Run migrations at container start | `true`       | No       |

`POSTGRES_POOL_MAX` is per worker, not per container. With the default
`PM2_INSTANCES=max` the real ceiling is `POSTGRES_POOL_MAX` × core count, so a
16-core host opens up to 160 connections against Postgres's default
`max_connections` of 100. Raise `max_connections` before raising the pool.

## Docker: nothing to do

`docker compose up -d` starts a `postgres:15-alpine` service, waits for its
health check, and then `scripts/deployment/docker-entrypoint.js` initialises the
schema on first boot and applies pending migrations on every subsequent boot.
Watch it happen:

```bash
docker compose logs -f ggrequestz | grep -iE "schema|migration"
```

Set `AUTO_MIGRATE=false` if you would rather apply migrations yourself during a
maintenance window; the app still starts, against whatever schema is present.

### Using an external PostgreSQL

Point the connection variables at your server and remove the `postgres` service
from `docker-compose.yml` (also drop it from the app's `depends_on`, or Compose
will refuse to start):

```bash
POSTGRES_HOST=db.internal.example.com
POSTGRES_PORT=5432
POSTGRES_DB=ggrequestz
POSTGRES_USER=ggrequestz
POSTGRES_PASSWORD=...
```

The database must exist and the user must own it. The app creates tables, not
databases.

## Running from source

```bash
docker compose up -d postgres    # or point .env at your own server
npm run db:migrate
```

## Migration commands

| Command              | Effect                                       |
| -------------------- | -------------------------------------------- |
| `npm run db:init`    | Create the core tables on an empty database  |
| `npm run db:migrate` | Apply every migration not yet recorded       |
| `npm run db:status`  | List applied and pending migrations          |
| `npm run db:warm`    | Populate the games cache with popular titles |
| `npm run db:stats`   | Print cache row counts and freshness         |
| `npm run db:fix`     | Repair a damaged `ggr_migrations` table      |

## How migrations are tracked

Files live in `migrations/`, named `NNN_description.sql`, and run in
**lexicographic order**. `db-manager.js` records each one in `ggr_migrations`
**by filename** and skips any filename already present.

Two consequences worth knowing:

- Renaming a migration that has already shipped makes it run again. Don't.
- Ordering is lexicographic, not numeric, so a hypothetical `010_` sorts before
  `002_`. Keep the three-digit prefix.

Write new migrations defensively (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
because there is no transaction wrapping the whole run and a partial failure
leaves the schema half-applied.

```sql
-- Migration: 009_add_widget_preference
-- Description: Per-user widget layout preference

ALTER TABLE ggr_users
  ADD COLUMN IF NOT EXISTS widget_layout JSONB DEFAULT '[]'::jsonb;
```

### Known limitations

These are real gaps in the current implementation. Do not rely on them working:

- **No locking.** `ggr_migration_lock` is created by `001_initial_schema.sql`
  but never read. Two containers booting at once are not serialised against
  each other. With `AUTO_MIGRATE=true` and a replicated deployment, roll one
  instance at a time.
- **No rollback.** `rollback_sql` is stored in `ggr_migrations` and never
  executed. Restoring from a backup is the only way back.
- **No version gate.** `ggr_schema_version` is written but never read; there is
  no upgrade path keyed on schema version.
- **Schema mismatches do not stop the app.** `verifySchemaIntegrity()` logs to
  stderr and returns. An instance that refuses to boot is harder to repair than
  one running degraded, so this is deliberate, but it means **you have to read
  the container logs after an upgrade** to know whether the schema is sound.

`migrations/legacy/` holds migrations from before the tracking table existed.
They are not run and are kept for reference only.

## Backups

```bash
# Dump
docker compose exec -T postgres pg_dump -U postgres ggrequestz > backup.sql

# Restore into an empty database
docker compose exec -T postgres psql -U postgres -d ggrequestz < backup.sql
```

Take a dump before every upgrade. Given that there is no rollback path, it is
the only way to undo a migration.

## Troubleshooting

**App exits with "Failed to connect to database after maximum retries"**
The entrypoint retries with a delay before giving up. Check that Postgres is
healthy (`docker compose ps`) and that `POSTGRES_HOST` resolves _from inside
the app container_: `localhost` is the container itself, not the host.

**"too many connections for role"**
`POSTGRES_POOL_MAX` × `PM2_INSTANCES` exceeds `max_connections`. Lower the pool,
pin `PM2_INSTANCES` to a number, or raise `max_connections`.

**A migration failed halfway**
Check `npm run db:status` for what was recorded, inspect the schema, and fix
forward with a new migration. `npm run db:fix` only repairs the tracking table
itself; it does not undo DDL.

**Schema warnings in the logs after upgrading**
`verifySchemaIntegrity()` found a mismatch and let the app boot anyway. Run
`npm run db:status`, and if migrations are pending, apply them.
