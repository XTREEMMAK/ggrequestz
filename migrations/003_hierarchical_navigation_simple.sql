-- Simplified Hierarchical Navigation Migration
-- Migration: 003_hierarchical_navigation_simple
-- Description: Adds hierarchical role-based visibility to custom navigation (simplified version)

-- =======================================
-- CREATE MIGRATIONS TABLE IF NOT EXISTS
-- =======================================

CREATE TABLE IF NOT EXISTS ggr_migrations (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN DEFAULT TRUE
);

-- =======================================
-- ADD HIERARCHICAL ROLE COLUMN
-- =======================================

-- Add minimum_role column to existing custom navigation table
ALTER TABLE ggr_custom_navigation 
ADD COLUMN IF NOT EXISTS minimum_role VARCHAR(20) DEFAULT 'viewer';

-- Create index for minimum_role column
CREATE INDEX IF NOT EXISTS idx_custom_nav_minimum_role ON ggr_custom_navigation(minimum_role);

-- Add is_system column to ggr_roles table if it doesn't exist
ALTER TABLE ggr_roles 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- Update existing system roles
UPDATE ggr_roles 
SET is_system = TRUE 
WHERE name IN ('admin', 'manager', 'moderator', 'user', 'viewer');

-- =======================================
-- MIGRATE EXISTING DATA
-- =======================================

-- Convert existing allowed_roles data to minimum_role format
-- This will find the highest (most restrictive) role in the allowed_roles array
-- and set that as the minimum_role

-- Function to convert allowed_roles to minimum_role
CREATE OR REPLACE FUNCTION migrate_navigation_roles()
RETURNS VOID AS $$
DECLARE
    nav_record RECORD;
    role_hierarchy TEXT[] := ARRAY['admin', 'manager', 'moderator', 'user', 'viewer'];
    allowed_role TEXT;
    minimum_role_found TEXT := 'viewer';
BEGIN
    -- Process each navigation item that has allowed_roles data
    FOR nav_record IN 
        SELECT id, allowed_roles, visible_to_all 
        FROM ggr_custom_navigation 
        WHERE allowed_roles IS NOT NULL 
        AND allowed_roles != '[]'::jsonb
        AND visible_to_all = false
    LOOP
        minimum_role_found := 'viewer'; -- Default
        
        -- Find the most restrictive (highest in hierarchy) role
        FOREACH allowed_role IN ARRAY role_hierarchy
        LOOP
            IF nav_record.allowed_roles ? allowed_role THEN
                minimum_role_found := allowed_role;
                EXIT; -- Exit loop on first match (highest role)
            END IF;
        END LOOP;
        
        -- Update the record with the minimum role
        UPDATE ggr_custom_navigation 
        SET minimum_role = minimum_role_found
        WHERE id = nav_record.id;
        
        RAISE NOTICE 'Updated navigation item % with minimum_role: %', nav_record.id, minimum_role_found;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
SELECT migrate_navigation_roles();

-- Drop the temporary function
DROP FUNCTION IF EXISTS migrate_navigation_roles();

-- =======================================
-- UPDATE SYSTEM SETTINGS
-- =======================================

-- Create system settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS ggr_system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add default settings for Gotify notifications if they don't exist
INSERT INTO ggr_system_settings (key, value, description) VALUES 
  ('gotify.notifications.new_requests', 'true', 'Send notifications for new game requests'),
  ('gotify.notifications.status_changes', 'true', 'Send notifications for request status changes'),
  ('gotify.notifications.admin_actions', 'false', 'Send notifications for admin actions')
ON CONFLICT (key) DO NOTHING;

-- Record this migration
INSERT INTO ggr_migrations (migration_name, executed_at, success) 
VALUES ('003_hierarchical_navigation', CURRENT_TIMESTAMP, true)
ON CONFLICT (migration_name) DO NOTHING;

-- Show completion message
SELECT 'Migration 003_hierarchical_navigation completed successfully' as status;