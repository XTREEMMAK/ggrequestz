-- Migration 003: User Preferences and Content Filtering System
-- This migration adds comprehensive user preference management and content filtering capabilities

-- Create user preferences table for personalized content filtering
CREATE TABLE IF NOT EXISTS ggr_user_preferences (
    user_id INTEGER PRIMARY KEY,

    -- Content Filtering Preferences
    content_filter_level VARCHAR(20) DEFAULT 'none' CHECK (content_filter_level IN ('none', 'mild', 'strict')),
    hide_mature_content BOOLEAN DEFAULT false,
    hide_nsfw_content BOOLEAN DEFAULT false,
    max_esrb_rating VARCHAR(10) DEFAULT 'M' CHECK (max_esrb_rating IN ('EC', 'E', 'E10+', 'T', 'M', 'AO', 'RP')),
    custom_content_blocks JSONB DEFAULT '[]', -- Array of custom content descriptors to block

    -- Genre Preferences
    preferred_genres JSONB DEFAULT '[]', -- Array of preferred genre names ['RPG', 'Shooter', 'Strategy']
    excluded_genres JSONB DEFAULT '[]', -- Array of genres to hide ['Horror', 'Sports']

    -- Application Settings - Where to apply preferences
    apply_to_homepage BOOLEAN DEFAULT false, -- Apply to all homepage sections
    apply_to_popular BOOLEAN DEFAULT false, -- Apply to Popular Games section
    apply_to_recent BOOLEAN DEFAULT false, -- Apply to New Releases section
    apply_to_search BOOLEAN DEFAULT true, -- Apply to search results by default

    -- Additional Safety Preferences
    show_content_warnings BOOLEAN DEFAULT true, -- Show content warning overlays
    safe_mode_enabled BOOLEAN DEFAULT false, -- Enable comprehensive safe mode
    require_confirmation_for_mature BOOLEAN DEFAULT false, -- Require click-through for mature content

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE
);

-- Create content ratings cache table for storing ESRB/PEGI/age rating data
CREATE TABLE IF NOT EXISTS ggr_content_ratings (
    igdb_id TEXT PRIMARY KEY,

    -- ESRB Rating Data
    esrb_rating VARCHAR(10), -- EC, E, E10+, T, M, AO, RP
    esrb_descriptors JSONB DEFAULT '[]', -- Array of content descriptors

    -- PEGI Rating Data
    pegi_rating VARCHAR(10), -- 3, 7, 12, 16, 18
    pegi_descriptors JSONB DEFAULT '[]', -- Array of PEGI content descriptors

    -- Content Assessment
    content_warnings JSONB DEFAULT '[]', -- Processed content warnings
    is_mature BOOLEAN DEFAULT false, -- Quick mature content flag
    is_nsfw BOOLEAN DEFAULT false, -- Quick NSFW flag
    has_violence BOOLEAN DEFAULT false, -- Violence content flag
    has_sexual_content BOOLEAN DEFAULT false, -- Sexual content flag
    has_drug_use BOOLEAN DEFAULT false, -- Drug/alcohol use flag
    has_gambling BOOLEAN DEFAULT false, -- Gambling content flag

    -- Cache metadata
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT false,

    -- Foreign key constraint
    FOREIGN KEY (igdb_id) REFERENCES ggr_games_cache(igdb_id) ON DELETE CASCADE
);

-- Create genre metadata cache for improved genre filtering performance
CREATE TABLE IF NOT EXISTS ggr_genre_metadata (
    id SERIAL PRIMARY KEY,
    igdb_id INTEGER UNIQUE NOT NULL, -- IGDB genre ID
    name VARCHAR(100) NOT NULL, -- Genre name (e.g., "Role-playing (RPG)")
    slug VARCHAR(100) NOT NULL, -- URL-friendly slug (e.g., "role-playing-rpg")
    description TEXT, -- Genre description from IGDB

    -- Content flags for genres themselves
    is_mature_genre BOOLEAN DEFAULT false, -- Genres like "Adult" or "Erotic"
    typical_content_rating VARCHAR(10), -- Most common rating for this genre

    -- Usage statistics
    game_count INTEGER DEFAULT 0, -- Number of games in this genre (for filtering)
    popularity_score NUMERIC(10,2) DEFAULT 0, -- Popularity score for sorting

    -- Cache metadata
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),

    -- Ensure unique names and slugs
    UNIQUE(name),
    UNIQUE(slug)
);

-- Create user content filter history table for analytics and improvement
CREATE TABLE IF NOT EXISTS ggr_user_filter_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'blocked_content', 'showed_warning', 'bypassed_filter'
    game_igdb_id TEXT,
    filter_reason VARCHAR(100), -- 'esrb_rating', 'genre_excluded', 'content_descriptor'
    metadata JSONB DEFAULT '{}', -- Additional context
    timestamp TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_igdb_id) REFERENCES ggr_games_cache(igdb_id) ON DELETE SET NULL
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_user_id ON ggr_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_content_filter ON ggr_user_preferences(content_filter_level, hide_mature_content, hide_nsfw_content);
CREATE INDEX IF NOT EXISTS idx_ggr_user_preferences_homepage_filters ON ggr_user_preferences(apply_to_homepage, apply_to_popular, apply_to_recent);

CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_igdb_id ON ggr_content_ratings(igdb_id);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_esrb ON ggr_content_ratings(esrb_rating);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_flags ON ggr_content_ratings(is_mature, is_nsfw);
CREATE INDEX IF NOT EXISTS idx_ggr_content_ratings_cached_at ON ggr_content_ratings(cached_at);

CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_igdb_id ON ggr_genre_metadata(igdb_id);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_name ON ggr_genre_metadata(name);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_slug ON ggr_genre_metadata(slug);
CREATE INDEX IF NOT EXISTS idx_ggr_genre_metadata_mature ON ggr_genre_metadata(is_mature_genre);

CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_user_id ON ggr_user_filter_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_timestamp ON ggr_user_filter_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_ggr_user_filter_history_action ON ggr_user_filter_history(action);

-- Insert default genre metadata for common genres (to be populated by IGDB sync)
-- This will be populated by the genre sync service

-- Insert default content rating mappings
-- ESRB rating hierarchy for filtering (lower number = more restrictive)
-- EC (1), E (2), E10+ (3), T (4), M (5), AO (6)

-- Add useful database functions for content filtering
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
        ELSE 999 -- Unknown ratings treated as most restrictive
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if a game passes user content filters
CREATE OR REPLACE FUNCTION game_passes_content_filter(
    game_esrb_rating VARCHAR(10),
    game_is_mature BOOLEAN,
    game_is_nsfw BOOLEAN,
    user_max_esrb_rating VARCHAR(10),
    user_hide_mature BOOLEAN,
    user_hide_nsfw BOOLEAN
) RETURNS BOOLEAN AS $$
BEGIN
    -- Check ESRB rating level
    IF get_esrb_rating_level(game_esrb_rating) > get_esrb_rating_level(user_max_esrb_rating) THEN
        RETURN false;
    END IF;

    -- Check mature content filter
    IF user_hide_mature AND game_is_mature THEN
        RETURN false;
    END IF;

    -- Check NSFW content filter
    IF user_hide_nsfw AND game_is_nsfw THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the schema version
INSERT INTO ggr_schema_version (version, rollback_sql) VALUES (3, '
    DROP FUNCTION IF EXISTS game_passes_content_filter;
    DROP FUNCTION IF EXISTS get_esrb_rating_level;
    DROP TABLE IF EXISTS ggr_user_filter_history;
    DROP TABLE IF EXISTS ggr_genre_metadata;
    DROP TABLE IF EXISTS ggr_content_ratings;
    DROP TABLE IF EXISTS ggr_user_preferences;
') ON CONFLICT (version) DO NOTHING;

-- Log successful migration
INSERT INTO ggr_migrations (migration_name, version, checksum)
VALUES ('003_user_preferences_and_content_filtering', 3, '003_user_prefs_content_filter_v1')
ON CONFLICT (migration_name) DO NOTHING;