-- Migration 005: Fix foreign key constraints and request system
-- This migration addresses issues with foreign key constraints that prevent request creation
-- when referenced games don't exist in the cache yet

-- Drop the problematic foreign key constraint that requires games to be cached before requests
-- This constraint was causing failures when users try to request games not yet in cache
ALTER TABLE ggr_game_requests
DROP CONSTRAINT IF EXISTS ggr_game_requests_igdb_id_fkey;

-- Drop foreign key constraint from user_watchlist as well for consistency
ALTER TABLE ggr_user_watchlist
DROP CONSTRAINT IF EXISTS ggr_user_watchlist_igdb_id_fkey;

-- Make igdb_id nullable in both tables (it should already be, but ensure it)
-- This allows requests and watchlist entries for games that haven't been cached yet
ALTER TABLE ggr_game_requests
ALTER COLUMN igdb_id DROP NOT NULL;

ALTER TABLE ggr_user_watchlist
ALTER COLUMN igdb_id DROP NOT NULL;

-- Add indexes for performance on igdb_id columns (these might already exist)
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_igdb_id_nullable
    ON ggr_game_requests(igdb_id) WHERE igdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ggr_user_watchlist_igdb_id_nullable
    ON ggr_user_watchlist(igdb_id) WHERE igdb_id IS NOT NULL;

-- Add a new table to track orphaned requests that need game data resolution
-- This helps identify requests that reference games not yet cached
CREATE TABLE IF NOT EXISTS ggr_orphaned_requests (
    id SERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    igdb_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES ggr_game_requests(id) ON DELETE CASCADE,
    UNIQUE(request_id, igdb_id)
);

-- Create index for efficient orphaned request lookups
CREATE INDEX IF NOT EXISTS idx_ggr_orphaned_requests_igdb_id
    ON ggr_orphaned_requests(igdb_id) WHERE resolved_at IS NULL;

-- Add a function to help resolve orphaned requests when games are cached
CREATE OR REPLACE FUNCTION resolve_orphaned_requests(game_igdb_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER := 0;
BEGIN
    -- Mark orphaned requests as resolved when the game gets cached
    UPDATE ggr_orphaned_requests
    SET resolved_at = NOW()
    WHERE igdb_id = game_igdb_id AND resolved_at IS NULL;

    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- Update the schema version
INSERT INTO ggr_schema_version (version, rollback_sql) VALUES (5, '
    DROP FUNCTION IF EXISTS resolve_orphaned_requests(TEXT);
    DROP INDEX IF EXISTS idx_ggr_orphaned_requests_igdb_id;
    DROP TABLE IF EXISTS ggr_orphaned_requests;
    DROP INDEX IF EXISTS idx_ggr_user_watchlist_igdb_id_nullable;
    DROP INDEX IF EXISTS idx_ggr_game_requests_igdb_id_nullable;

    -- Re-add the foreign key constraints (this might fail if there are orphaned records)
    -- ALTER TABLE ggr_user_watchlist ADD CONSTRAINT ggr_user_watchlist_igdb_id_fkey
    --     FOREIGN KEY (igdb_id) REFERENCES ggr_games_cache(igdb_id);
    -- ALTER TABLE ggr_game_requests ADD CONSTRAINT ggr_game_requests_igdb_id_fkey
    --     FOREIGN KEY (igdb_id) REFERENCES ggr_games_cache(igdb_id);
') ON CONFLICT (version) DO NOTHING;

-- Log successful migration
INSERT INTO ggr_migrations (migration_name, version, checksum)
VALUES ('005_fix_foreign_key_constraints', 5, '005_fix_fk_constraints_v1')
ON CONFLICT (migration_name) DO NOTHING;