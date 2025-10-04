-- Migration 002: Complete Schema Updates (Consolidated)
-- This migration combines all schema updates from migrations 002-006 for fresh installations
-- For existing installations that have run the individual migrations, this will be skipped

-- ============================================================================
-- PART 1: Update ggr_games_cache table with all additional columns
-- ============================================================================

-- Add updated_at column if missing (migration 001 bug fix)
ALTER TABLE ggr_games_cache
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add metadata column for ROMM integration
ALTER TABLE ggr_games_cache
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add ESRB/content rating columns with correct sizes from the start
ALTER TABLE ggr_games_cache
ADD COLUMN IF NOT EXISTS content_rating TEXT, -- Using TEXT to prevent "value too long" errors
ADD COLUMN IF NOT EXISTS esrb_rating VARCHAR(50),      -- Using larger size for flexibility
ADD COLUMN IF NOT EXISTS is_mature BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT false;

-- ============================================================================
-- PART 2: Create user preferences and content filtering tables
-- ============================================================================

-- Create user preferences table for personalized content filtering
CREATE TABLE IF NOT EXISTS ggr_user_preferences (
    user_id INTEGER PRIMARY KEY,

    -- Content Filtering Preferences
    content_filter_level VARCHAR(20) DEFAULT 'none' CHECK (content_filter_level IN ('none', 'mild', 'strict')),
    hide_mature_content BOOLEAN DEFAULT false,
    hide_nsfw_content BOOLEAN DEFAULT false,
    max_esrb_rating VARCHAR(10) DEFAULT 'M' CHECK (max_esrb_rating IN ('EC', 'E', 'E10+', 'T', 'M', 'AO', 'RP')),
    custom_content_blocks JSONB DEFAULT '[]',

    -- Genre Preferences
    preferred_genres JSONB DEFAULT '[]',
    excluded_genres JSONB DEFAULT '[]',

    -- Application Settings
    apply_to_homepage BOOLEAN DEFAULT false,
    apply_to_popular BOOLEAN DEFAULT false,
    apply_to_recent BOOLEAN DEFAULT false,
    apply_to_search BOOLEAN DEFAULT true,

    -- Additional Safety Preferences
    show_content_warnings BOOLEAN DEFAULT true,
    safe_mode_enabled BOOLEAN DEFAULT false,
    require_confirmation_for_mature BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE
);

-- Create content ratings cache table
CREATE TABLE IF NOT EXISTS ggr_content_ratings (
    igdb_id TEXT PRIMARY KEY,

    -- ESRB Rating Data
    esrb_rating VARCHAR(10),
    esrb_descriptors JSONB DEFAULT '[]',

    -- PEGI Rating Data
    pegi_rating VARCHAR(10),
    pegi_descriptors JSONB DEFAULT '[]',

    -- Content Assessment
    content_warnings JSONB DEFAULT '[]',
    is_mature BOOLEAN DEFAULT false,
    is_nsfw BOOLEAN DEFAULT false,
    has_violence BOOLEAN DEFAULT false,
    has_sexual_content BOOLEAN DEFAULT false,
    has_drug_use BOOLEAN DEFAULT false,
    has_gambling BOOLEAN DEFAULT false,

    -- Cache metadata
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT false,

    -- Note: NOT adding foreign key to ggr_games_cache to avoid circular dependencies
    -- Games can be rated before being cached
    CONSTRAINT ggr_content_ratings_igdb_id_check CHECK (igdb_id IS NOT NULL AND igdb_id != '')
);

-- Create genre metadata cache
CREATE TABLE IF NOT EXISTS ggr_genre_metadata (
    id SERIAL PRIMARY KEY,
    igdb_id INTEGER UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,

    -- Content flags
    is_mature_genre BOOLEAN DEFAULT false,
    typical_content_rating VARCHAR(10),

    -- Usage statistics
    game_count INTEGER DEFAULT 0,
    popularity_score NUMERIC(10,2) DEFAULT 0,

    -- Cache metadata
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),

    UNIQUE(name),
    UNIQUE(slug)
);

-- Create user content filter history table
CREATE TABLE IF NOT EXISTS ggr_user_filter_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    game_igdb_id TEXT,
    filter_reason VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE
    -- Note: NOT adding foreign key to games_cache for game_igdb_id
);

-- ============================================================================
-- PART 3: Fix content_rating field type for existing installations (from migration 007)
-- ============================================================================

-- Change content_rating field type to TEXT to handle unlimited length content descriptions
-- This is safe for both new and existing installations
ALTER TABLE ggr_games_cache
ALTER COLUMN content_rating TYPE TEXT;

-- ============================================================================
-- PART 4: Fix foreign key constraints (from migration 005)
-- ============================================================================

-- Drop problematic foreign key constraints if they exist
-- These prevent requests for games not yet in cache
ALTER TABLE ggr_game_requests
DROP CONSTRAINT IF EXISTS ggr_game_requests_igdb_id_fkey;

ALTER TABLE ggr_user_watchlist
DROP CONSTRAINT IF EXISTS ggr_user_watchlist_igdb_id_fkey;

-- Make igdb_id nullable in both tables
ALTER TABLE ggr_game_requests
ALTER COLUMN igdb_id DROP NOT NULL;

ALTER TABLE ggr_user_watchlist
ALTER COLUMN igdb_id DROP NOT NULL;

-- Create table to track orphaned requests
CREATE TABLE IF NOT EXISTS ggr_orphaned_requests (
    id SERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    igdb_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES ggr_game_requests(id) ON DELETE CASCADE,
    UNIQUE(request_id, igdb_id)
);

-- ============================================================================
-- PART 5: Create all indexes for performance
-- ============================================================================

-- Indexes for games cache
CREATE INDEX IF NOT EXISTS idx_games_cache_metadata_romm
    ON ggr_games_cache USING GIN((metadata->'is_romm_game'))
    WHERE metadata->>'is_romm_game' = 'true';

CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_esrb_rating
    ON ggr_games_cache(esrb_rating);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_is_mature
    ON ggr_games_cache(is_mature);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_is_nsfw
    ON ggr_games_cache(is_nsfw);

-- Indexes for user preferences
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_user_id
    ON ggr_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_content_filter
    ON ggr_user_preferences(content_filter_level, hide_mature_content, hide_nsfw_content);
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_homepage_filters
    ON ggr_user_preferences(apply_to_homepage, apply_to_popular, apply_to_recent);

-- Indexes for content ratings
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_igdb_id
    ON ggr_content_ratings(igdb_id);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_esrb
    ON ggr_content_ratings(esrb_rating);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_flags
    ON ggr_content_ratings(is_mature, is_nsfw);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_cached_at
    ON ggr_content_ratings(cached_at);

-- Indexes for genre metadata
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_igdb_id
    ON ggr_genre_metadata(igdb_id);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_name
    ON ggr_genre_metadata(name);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_slug
    ON ggr_genre_metadata(slug);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_mature
    ON ggr_genre_metadata(is_mature_genre);

-- Indexes for filter history
CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_user_id
    ON ggr_user_filter_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_timestamp
    ON ggr_user_filter_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_action
    ON ggr_user_filter_history(action);

-- Indexes for requests and watchlist (nullable igdb_id)
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_igdb_id_nullable
    ON ggr_game_requests(igdb_id) WHERE igdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ggr_user_watchlist_igdb_id_nullable
    ON ggr_user_watchlist(igdb_id) WHERE igdb_id IS NOT NULL;

-- Indexes for orphaned requests
CREATE INDEX IF NOT EXISTS idx_ggr_orphaned_requests_igdb_id
    ON ggr_orphaned_requests(igdb_id) WHERE resolved_at IS NULL;

-- ============================================================================
-- PART 6: Create utility functions
-- ============================================================================

-- Function to get ESRB rating level
CREATE OR REPLACE FUNCTION get_esrb_rating_level(rating VARCHAR(10))
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE rating
        WHEN 'EC' THEN 1
        WHEN 'E' THEN 2
        WHEN 'E10+' THEN 3
        WHEN 'T' THEN 4
        WHEN 'M' THEN 5
        WHEN 'AO' THEN 6
        ELSE 999
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if game passes content filter
CREATE OR REPLACE FUNCTION game_passes_content_filter(
    game_esrb_rating VARCHAR(10),
    game_is_mature BOOLEAN,
    game_is_nsfw BOOLEAN,
    user_max_esrb_rating VARCHAR(10),
    user_hide_mature BOOLEAN,
    user_hide_nsfw BOOLEAN
) RETURNS BOOLEAN AS $$
BEGIN
    IF get_esrb_rating_level(game_esrb_rating) > get_esrb_rating_level(user_max_esrb_rating) THEN
        RETURN false;
    END IF;

    IF user_hide_mature AND game_is_mature THEN
        RETURN false;
    END IF;

    IF user_hide_nsfw AND game_is_nsfw THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to resolve orphaned requests
CREATE OR REPLACE FUNCTION resolve_orphaned_requests(game_igdb_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    resolved_count INTEGER := 0;
BEGIN
    UPDATE ggr_orphaned_requests
    SET resolved_at = NOW()
    WHERE igdb_id = game_igdb_id AND resolved_at IS NULL;

    GET DIAGNOSTICS resolved_count = ROW_COUNT;
    RETURN resolved_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 7: Add column comments for documentation
-- ============================================================================

COMMENT ON COLUMN ggr_games_cache.content_rating IS 'Full content rating description from IGDB (unlimited length for detailed descriptors)';
COMMENT ON COLUMN ggr_games_cache.esrb_rating IS 'ESRB rating code (E, E10+, T, M, AO, RP, etc.)';
COMMENT ON COLUMN ggr_games_cache.metadata IS 'Additional metadata including ROMM integration flags';
COMMENT ON COLUMN ggr_games_cache.is_mature IS 'Quick flag for mature content filtering';
COMMENT ON COLUMN ggr_games_cache.is_nsfw IS 'Quick flag for NSFW content filtering';

-- ============================================================================
-- PART 8: API Keys System
-- ============================================================================

-- Create API keys table for API authentication
CREATE TABLE IF NOT EXISTS ggr_api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    scopes JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER,

    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES ggr_users(id),
    UNIQUE(key_prefix)
);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_user_id
    ON ggr_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_key_prefix
    ON ggr_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_active
    ON ggr_api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_expires
    ON ggr_api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Comments for API keys table
COMMENT ON TABLE ggr_api_keys IS 'API keys for programmatic access to the API';
COMMENT ON COLUMN ggr_api_keys.key_hash IS 'Bcrypt hash of the API key (never store plaintext)';
COMMENT ON COLUMN ggr_api_keys.key_prefix IS 'First 8-16 characters of key for display (e.g., ggr_1234...)';
COMMENT ON COLUMN ggr_api_keys.scopes IS 'Array of permission scopes this key has access to';
COMMENT ON COLUMN ggr_api_keys.last_used_at IS 'Last time this API key was used for authentication';
COMMENT ON COLUMN ggr_api_keys.expires_at IS 'Optional expiration date for the key';

-- ============================================================================
-- PART 9: Update migration tracking
-- ============================================================================

-- Update schema version to 2 (since this combines 2-6)
INSERT INTO ggr_schema_version (version, rollback_sql) VALUES (2, '
    -- This consolidated migration would need manual rollback
    -- It combines migrations 002-006
    -- To rollback: restore database from backup before migration
') ON CONFLICT (version) DO NOTHING;

-- Record this consolidated migration
INSERT INTO ggr_migrations (migration_name, version, checksum)
VALUES ('002_complete_schema_updates', 2, '002_consolidated_v1')
ON CONFLICT (migration_name) DO NOTHING;

-- For compatibility with existing installations that ran individual migrations,
-- also record the individual migrations as completed
INSERT INTO ggr_migrations (migration_name, version, checksum)
SELECT * FROM (VALUES
    ('002_add_games_cache_metadata.sql', 2, 'games_cache_metadata_v1'),
    ('003_user_preferences_and_content_filtering', 3, '003_user_prefs_content_filter_v1'),
    ('004_add_esrb_columns_to_games_cache', 4, '004_esrb_games_cache_v1'),
    ('005_fix_foreign_key_constraints', 5, '005_fix_fk_constraints_v1'),
    ('006_fix_content_rating_field_length', 6, '006_fix_content_rating_length_v1'),
    ('007_fix_content_rating_field_type', 7, '007_content_rating_text_v1')
) AS migrations(migration_name, version, checksum)
ON CONFLICT (migration_name) DO NOTHING;