-- Migration 002: Add security settings for 404 protection
-- This migration adds the security settings for existing installations

-- Insert security settings if they don't exist
INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive)
VALUES (
    'security_404_limit',
    '{"enabled": true, "maxAttempts": 5, "timeWindow": 300, "logoutUser": true, "notifyAdmin": true}',
    'security',
    'Security settings for 404 attempt limiting and monitoring',
    false
) ON CONFLICT (key) DO NOTHING;

-- Update schema version
INSERT INTO ggr_schema_version (version)
VALUES (2)
ON CONFLICT (version) DO NOTHING;

-- Record this migration
INSERT INTO ggr_migrations (migration_name, checksum, version)
VALUES ('002_security_settings.sql', 'security_settings_v1', 2)
ON CONFLICT (migration_name) DO NOTHING;