-- Migration 004: Add ESRB rating columns to ggr_games_cache table
-- This migration adds ESRB rating fields directly to the games cache table for better performance

-- Add ESRB rating columns to the main games cache table
ALTER TABLE ggr_games_cache
ADD COLUMN IF NOT EXISTS content_rating VARCHAR(20),
ADD COLUMN IF NOT EXISTS esrb_rating VARCHAR(10),
ADD COLUMN IF NOT EXISTS is_mature BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT false;

-- Create indexes for the new columns for better query performance
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_esrb_rating ON ggr_games_cache(esrb_rating);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_is_mature ON ggr_games_cache(is_mature);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_is_nsfw ON ggr_games_cache(is_nsfw);

-- Update the schema version
INSERT INTO ggr_schema_version (version, rollback_sql) VALUES (4, '
    DROP INDEX IF EXISTS idx_ggr_games_cache_is_nsfw;
    DROP INDEX IF EXISTS idx_ggr_games_cache_is_mature;
    DROP INDEX IF EXISTS idx_ggr_games_cache_esrb_rating;
    ALTER TABLE ggr_games_cache
    DROP COLUMN IF EXISTS is_nsfw,
    DROP COLUMN IF EXISTS is_mature,
    DROP COLUMN IF EXISTS esrb_rating,
    DROP COLUMN IF EXISTS content_rating;
') ON CONFLICT (version) DO NOTHING;

-- Log successful migration
INSERT INTO ggr_migrations (migration_name, version, checksum)
VALUES ('004_add_esrb_columns_to_games_cache', 4, '004_esrb_games_cache_v1')
ON CONFLICT (migration_name) DO NOTHING;