-- Migration 002: Add metadata column to ggr_games_cache for ROMM integration
-- This adds the missing metadata JSONB column needed for ROMM cache clearing

-- Add metadata column if it doesn't exist
ALTER TABLE ggr_games_cache
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index for ROMM metadata queries
CREATE INDEX IF NOT EXISTS idx_games_cache_metadata_romm
ON ggr_games_cache USING GIN((metadata->'is_romm_game'))
WHERE metadata->>'is_romm_game' = 'true';

-- Update schema version
INSERT INTO ggr_schema_version (version)
VALUES (2)
ON CONFLICT (version) DO NOTHING;

-- Record this migration
INSERT INTO ggr_migrations (migration_name, checksum, version)
VALUES ('002_add_games_cache_metadata.sql', 'games_cache_metadata_v1', 2)
ON CONFLICT (migration_name) DO NOTHING;