-- Migration 003: Hotfix for missing columns and tables
-- Adds columns that should have been added by migration 002 but were missed
-- Also creates ggr_api_keys table if it doesn't exist

-- ============================================================================
-- PART 1: Add missing updated_at column to ggr_games_cache
-- ============================================================================

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'ggr_games_cache'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE ggr_games_cache ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to ggr_games_cache';
    ELSE
        RAISE NOTICE 'updated_at column already exists in ggr_games_cache';
    END IF;
END $$;

-- ============================================================================
-- PART 2: Create the update_games_cache_timestamp function if missing
-- ============================================================================

-- Create the function that updates last_updated timestamp
CREATE OR REPLACE FUNCTION update_games_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- PART 3: Fix the trigger to use correct function
-- ============================================================================

-- Drop and recreate trigger to ensure it uses the correct function
DROP TRIGGER IF EXISTS update_games_cache_updated_at ON ggr_games_cache;

CREATE TRIGGER update_games_cache_updated_at
    BEFORE UPDATE ON ggr_games_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_games_cache_timestamp();

-- ============================================================================
-- PART 4: Create ggr_api_keys table if it doesn't exist
-- ============================================================================

CREATE TABLE IF NOT EXISTS ggr_api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL UNIQUE,
    scopes JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER,

    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES ggr_users(id) ON DELETE SET NULL
);

-- Create indexes for ggr_api_keys
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_user_id
    ON ggr_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_key_prefix
    ON ggr_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_active
    ON ggr_api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ggr_api_keys_expires
    ON ggr_api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Add comments
COMMENT ON TABLE ggr_api_keys IS 'API keys for programmatic access to the API';
COMMENT ON COLUMN ggr_api_keys.key_hash IS 'Bcrypt hash of the API key (never store plaintext)';
COMMENT ON COLUMN ggr_api_keys.key_prefix IS 'First 8-16 characters of key for display (e.g., ggr_1234...)';
COMMENT ON COLUMN ggr_api_keys.scopes IS 'Array of permission scopes this key has access to';
COMMENT ON COLUMN ggr_api_keys.last_used_at IS 'Last time this API key was used for authentication';
COMMENT ON COLUMN ggr_api_keys.expires_at IS 'Optional expiration date for the key';

-- Create trigger for ggr_api_keys
CREATE TRIGGER update_ggr_api_keys_updated_at
    BEFORE UPDATE ON ggr_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: Add API Key Management Permissions
-- ============================================================================

-- Add API key management permissions
INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
    ('apikey.view', 'View API Keys', 'Can view their own API keys', 'apikeys'),
    ('apikey.create', 'Create API Keys', 'Can create new API keys', 'apikeys'),
    ('apikey.revoke', 'Revoke API Keys', 'Can revoke/disable API keys', 'apikeys'),
    ('apikey.delete', 'Delete API Keys', 'Can permanently delete API keys', 'apikeys'),
    ('apikey.manage_all', 'Manage All API Keys', 'Can manage API keys for all users', 'apikeys')
ON CONFLICT (name) DO NOTHING;

-- Grant API key permissions to admin role (admins get all API key permissions)
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
WHERE r.name = 'admin' AND p.name IN ('apikey.view', 'apikey.create', 'apikey.revoke', 'apikey.delete', 'apikey.manage_all')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant basic API key permissions to user role (users can manage their own keys)
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
WHERE r.name = 'user' AND p.name IN ('apikey.view', 'apikey.create', 'apikey.revoke')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- PART 6: Add Role Management Permissions
-- ============================================================================

-- Add role management permissions to prevent privilege escalation
INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
    ('role.view', 'View Roles', 'Can view roles and their permissions', 'roles'),
    ('role.create', 'Create Roles', 'Can create new custom roles', 'roles'),
    ('role.edit_permissions', 'Edit Role Permissions', 'Can modify which permissions a role has (requires admin status)', 'roles'),
    ('role.delete', 'Delete Roles', 'Can delete custom roles', 'roles'),
    ('role.assign', 'Assign Roles to Users', 'Can assign or remove roles from user accounts', 'roles')
ON CONFLICT (name) DO NOTHING;

-- Grant all role management permissions to admin role
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
WHERE r.name = 'admin' AND p.name IN ('role.view', 'role.create', 'role.edit_permissions', 'role.delete', 'role.assign')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- PART 7: Create Performance Indexes
-- ============================================================================

-- Create indexes for better permission lookup performance
CREATE INDEX IF NOT EXISTS idx_ggr_permissions_category ON ggr_permissions(category);
CREATE INDEX IF NOT EXISTS idx_ggr_permissions_name ON ggr_permissions(name);

-- Add helpful comments
COMMENT ON TABLE ggr_permissions IS 'Stores granular permissions for role-based access control';
COMMENT ON TABLE ggr_role_permissions IS 'Maps roles to their permissions - controls what users with each role can do';
