-- Migration: Add Banned Games Global Filter
-- Description: Adds ability to ban specific games globally by IGDB ID
-- Version: 005
-- Date: 2025-10-06

-- Add banned games setting (JSON array of IGDB IDs)
INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive, updated_at)
VALUES
    ('content.global_banned_games', '[]', 'content', 'List of banned game IGDB IDs (JSON array)', false, NOW())
ON CONFLICT (key) DO NOTHING;
