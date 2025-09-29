# Legacy Migration Files

This directory contains the original individual migration files that have been consolidated into `002_complete_schema_updates.sql` for fresh installations.

## Why These Files Were Archived

For fresh Docker installations, running 6 separate migrations was causing issues and complexity. The consolidated migration provides:

1. **Correct field sizes from the start** - No need to alter VARCHAR lengths after creation
2. **No circular dependencies** - Foreign keys that get removed later are never added
3. **Simplified deployment** - Only 2 migrations instead of 6
4. **Better performance** - Single transaction for all updates

## Migration Files

- **002_add_games_cache_metadata.sql** - Added metadata JSONB column
- **003_user_preferences_and_content_filtering.sql** - Created user preference tables
- **004_add_esrb_columns_to_games_cache.sql** - Added ESRB rating columns
- **005_fix_foreign_key_constraints.sql** - Removed problematic foreign keys
- **006_fix_content_rating_field_length.sql** - Fixed VARCHAR length issues

## Compatibility

The consolidated migration (`002_complete_schema_updates.sql`) includes logic to mark all these individual migrations as completed in the migration tracking table, ensuring compatibility with existing installations that may have already run some or all of these migrations.

## When to Use These Files

These files should only be referenced if:

1. You need to understand the historical evolution of the schema
2. You're debugging issues with an older installation
3. You need to manually apply specific fixes to a production database

For all new installations, use the consolidated migration approach.
