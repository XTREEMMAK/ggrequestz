# Migrations

SQL migrations applied by `scripts/database/db-manager.js`, tracked **by
filename** in the `ggr_migrations` table and run in **lexicographic** order.

```bash
npm run db:migrate   # apply everything not yet recorded
npm run db:status    # show applied and pending
```

In Docker this runs automatically at container start unless `AUTO_MIGRATE=false`.

## Adding one

Name it `NNN_description.sql`, taking the next free number. Migrations that have
shipped are immutable: the tracker keys on the filename, so renaming or editing
one either re-runs it or silently skips your change.

Write defensively. There is no transaction around the run as a whole, so a
failure partway through leaves the schema half-applied:

```sql
-- Migration: 009_add_widget_preference
-- Description: Per-user widget layout preference

ALTER TABLE ggr_users
  ADD COLUMN IF NOT EXISTS widget_layout JSONB DEFAULT '[]'::jsonb;
```

`db-manager.js` writes the `ggr_migrations` row itself. Migration files should
not insert one.

## legacy/

Migrations predating the tracking table. They are **not** run and are kept for
reference when tracing where a column came from. Numbers collide in here
(`003_hotfix_missing_columns.sql` and `003_user_preferences_and_content_filtering.sql`
both exist); that collision is why the tracker moved to filenames.

See [docs/setup/DATABASE_SETUP.md](../docs/setup/DATABASE_SETUP.md) for the
limitations of this system: no locking, no rollback, non-fatal schema
verification.
