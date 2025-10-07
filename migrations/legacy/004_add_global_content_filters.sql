-- Migration: Add Global Content Filter Settings
-- Description: Adds system-wide content filtering settings that supersede user preferences
-- Version: 004
-- Date: 2025-10-06

-- Add global content filter settings to system settings table
INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive, updated_at)
VALUES
    -- Global filter master switch
    ('content.global_filter_enabled', 'false', 'content', 'Enable global content filtering (supersedes user preferences)', false, NOW()),

    -- ESRB rating limit
    ('content.global_max_esrb_rating', 'null', 'content', 'Maximum ESRB rating allowed globally (EC, E, E10+, T, M, AO, or null for no limit)', false, NOW()),

    -- Mature content filters
    ('content.global_hide_mature', 'false', 'content', 'Globally hide mature content', false, NOW()),
    ('content.global_hide_nsfw', 'false', 'content', 'Globally hide NSFW content', false, NOW()),

    -- Custom content blocks (JSON array of keywords)
    ('content.global_custom_blocks', '[]', 'content', 'Global list of custom content keywords to block (JSON array)', false, NOW()),

    -- Genre filters (JSON array of genre names)
    ('content.global_excluded_genres', '[]', 'content', 'Globally excluded genres (JSON array)', false, NOW())
ON CONFLICT (key) DO NOTHING;

-- Create index for content-related settings for faster lookups
CREATE INDEX IF NOT EXISTS idx_ggr_system_settings_content_category
    ON ggr_system_settings(category) WHERE category = 'content';

-- Add comment to document the purpose
COMMENT ON INDEX idx_ggr_system_settings_content_category IS 'Index for fast lookup of content filter settings';
