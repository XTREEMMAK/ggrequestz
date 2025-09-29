-- Migration 006: Fix content_rating field length issue
-- This migration increases the content_rating field length to handle longer IGDB rating descriptions
-- Fixes PostgreSQL error: "value too long for type character varying(20)"

-- Increase the content_rating field size to accommodate longer IGDB rating strings
-- Some IGDB content ratings can be quite verbose (e.g., "Mature 17+ Blood and Gore, Intense Violence, Strong Language")
ALTER TABLE ggr_games_cache
ALTER COLUMN content_rating TYPE VARCHAR(255);

-- Also fix the esrb_rating field if it has the same issue
-- ESRB ratings themselves are short (E, T, M, etc.) but keeping consistent length
ALTER TABLE ggr_games_cache
ALTER COLUMN esrb_rating TYPE VARCHAR(50);

-- Update the schema version
INSERT INTO ggr_schema_version (version, rollback_sql) VALUES (6, '
    -- Rollback to previous field sizes
    ALTER TABLE ggr_games_cache ALTER COLUMN content_rating TYPE VARCHAR(20);
    ALTER TABLE ggr_games_cache ALTER COLUMN esrb_rating TYPE VARCHAR(20);
') ON CONFLICT (version) DO NOTHING;

-- Log successful migration
INSERT INTO ggr_migrations (migration_name, version, checksum)
VALUES ('006_fix_content_rating_field_length', 6, '006_fix_content_rating_length_v1')
ON CONFLICT (migration_name) DO NOTHING;

-- Add comment to document the field purpose
COMMENT ON COLUMN ggr_games_cache.content_rating IS 'Full content rating description from IGDB (can include detailed descriptors)';
COMMENT ON COLUMN ggr_games_cache.esrb_rating IS 'ESRB rating code (E, E10+, T, M, AO, RP, etc.)';