-- G.G Requestz Complete Database Initialization for Docker
-- This script sets up the complete database schema with all features
-- Use this file for Docker database initialization

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =======================================
-- CORE TABLES
-- =======================================

-- Migration tracking table
CREATE TABLE IF NOT EXISTS ggr_migrations (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN DEFAULT TRUE
);

-- Unified users table (supports both basic auth and OIDC)
CREATE TABLE IF NOT EXISTS ggr_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255), -- For basic auth users
  name VARCHAR(255),
  preferred_username VARCHAR(255),
  avatar_url TEXT,
  
  -- Basic auth specific fields (null for OIDC users)
  password_hash TEXT,
  password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  force_password_change BOOLEAN DEFAULT false,
  
  -- OIDC specific fields (null for basic auth users)
  authentik_sub VARCHAR(255) UNIQUE,
  
  -- Common fields
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Roles table
CREATE TABLE IF NOT EXISTS ggr_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS ggr_permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission mapping
CREATE TABLE IF NOT EXISTS ggr_role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES ggr_roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES ggr_permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id)
);

-- User-Role mapping
CREATE TABLE IF NOT EXISTS ggr_user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ggr_users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES ggr_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INTEGER REFERENCES ggr_users(id),
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  UNIQUE(user_id, role_id)
);

-- =======================================
-- GAMES AND REQUESTS
-- =======================================

-- Games cache table
CREATE TABLE IF NOT EXISTS ggr_games_cache (
  id SERIAL PRIMARY KEY,
  igdb_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  cover_url TEXT,
  rating DECIMAL(5,2),
  release_date DATE,
  platforms JSONB DEFAULT '[]'::jsonb,
  genres JSONB DEFAULT '[]'::jsonb,
  screenshots JSONB DEFAULT '[]'::jsonb,
  videos JSONB DEFAULT '[]'::jsonb,
  companies JSONB DEFAULT '[]'::jsonb,
  game_modes JSONB DEFAULT '[]'::jsonb,
  popularity_score DECIMAL(10,2) DEFAULT 0,
  needs_refresh BOOLEAN DEFAULT false,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game requests table
CREATE TABLE IF NOT EXISTS ggr_game_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reason TEXT,
  platforms TEXT[],
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  request_type VARCHAR(20) DEFAULT 'game' CHECK (request_type IN ('game', 'update', 'fix')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'rejected', 'cancelled')),
  user_id INTEGER NOT NULL REFERENCES ggr_users(id), -- Updated to reference ggr_users
  user_name VARCHAR(255),
  igdb_id VARCHAR(50), -- Links to games cache
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at TIMESTAMP
);

-- User watchlist table
CREATE TABLE IF NOT EXISTS ggr_user_watchlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ggr_users(id) ON DELETE CASCADE,
  igdb_id VARCHAR(50) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(user_id, igdb_id)
);

-- =======================================
-- CUSTOM NAVIGATION
-- =======================================

-- Custom navigation table
CREATE TABLE IF NOT EXISTS ggr_custom_navigation (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  href VARCHAR(500) NOT NULL,
  icon VARCHAR(100) DEFAULT 'heroicons:link',
  position INTEGER DEFAULT 100,
  is_external BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Role-based visibility features
  visible_to_all BOOLEAN DEFAULT true,
  visible_to_guests BOOLEAN DEFAULT true,
  allowed_roles JSONB DEFAULT '[]'::jsonb,
  minimum_role VARCHAR(20) DEFAULT 'viewer', -- Hierarchical role system
  
  -- Audit fields
  created_by INTEGER REFERENCES ggr_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================================
-- SYSTEM TABLES
-- =======================================

-- System settings table
CREATE TABLE IF NOT EXISTS ggr_system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by INTEGER REFERENCES ggr_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User analytics table
CREATE TABLE IF NOT EXISTS ggr_user_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Flexible to handle different ID formats
  action VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS ggr_audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  user_id INTEGER REFERENCES ggr_users(id),
  user_email VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System events log
CREATE TABLE IF NOT EXISTS ggr_system_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  message TEXT NOT NULL,
  context JSONB,
  source VARCHAR(100),
  stack_trace TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================================
-- INDEXES
-- =======================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON ggr_users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON ggr_users(username);
CREATE INDEX IF NOT EXISTS idx_users_authentik_sub ON ggr_users(authentik_sub);
CREATE INDEX IF NOT EXISTS idx_users_active ON ggr_users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_password_changed ON ggr_users(password_changed_at);
CREATE INDEX IF NOT EXISTS idx_users_force_change ON ggr_users(force_password_change);

-- Roles and permissions indexes
CREATE INDEX IF NOT EXISTS idx_roles_name ON ggr_roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_active ON ggr_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_permissions_name ON ggr_permissions(name);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON ggr_permissions(category);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON ggr_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON ggr_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON ggr_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON ggr_user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON ggr_user_roles(is_active);

-- Games cache indexes
CREATE INDEX IF NOT EXISTS idx_games_cache_igdb_id ON ggr_games_cache(igdb_id);
CREATE INDEX IF NOT EXISTS idx_games_cache_title ON ggr_games_cache USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_games_cache_popularity ON ggr_games_cache(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_games_cache_rating ON ggr_games_cache(rating DESC);
CREATE INDEX IF NOT EXISTS idx_games_cache_release_date ON ggr_games_cache(release_date DESC);

-- Game requests indexes
CREATE INDEX IF NOT EXISTS idx_requests_user ON ggr_game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON ggr_game_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON ggr_game_requests(priority);
CREATE INDEX IF NOT EXISTS idx_requests_created ON ggr_game_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_title ON ggr_game_requests USING gin(title gin_trgm_ops);

-- Watchlist indexes
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON ggr_user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_igdb_id ON ggr_user_watchlist(igdb_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_added ON ggr_user_watchlist(added_at DESC);

-- Custom navigation indexes
CREATE INDEX IF NOT EXISTS idx_custom_nav_active ON ggr_custom_navigation(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_nav_position ON ggr_custom_navigation(position);
CREATE INDEX IF NOT EXISTS idx_custom_nav_visibility ON ggr_custom_navigation(visible_to_all, visible_to_guests);
CREATE INDEX IF NOT EXISTS idx_custom_nav_roles ON ggr_custom_navigation USING gin(allowed_roles);

-- System indexes
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_by ON ggr_system_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON ggr_user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_action ON ggr_user_analytics(action);
CREATE INDEX IF NOT EXISTS idx_user_analytics_timestamp ON ggr_user_analytics(timestamp DESC);

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON ggr_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON ggr_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ggr_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON ggr_system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON ggr_system_events(created_at DESC);

-- =======================================
-- FUNCTIONS AND TRIGGERS
-- =======================================

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON ggr_users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_navigation_updated_at 
  BEFORE UPDATE ON ggr_custom_navigation 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at 
  BEFORE UPDATE ON ggr_system_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_cache_updated_at 
  BEFORE UPDATE ON ggr_games_cache 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_requests_updated_at 
  BEFORE UPDATE ON ggr_game_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at 
  BEFORE UPDATE ON ggr_roles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- System logging function
CREATE OR REPLACE FUNCTION log_system_event(
  event_type_param VARCHAR(100),
  message_param TEXT,
  severity_param VARCHAR(20) DEFAULT 'info',
  context_param JSONB DEFAULT NULL,
  source_param VARCHAR(100) DEFAULT NULL,
  stack_trace_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO ggr_system_events (
    event_type, severity, message, context, source, stack_trace
  ) VALUES (
    event_type_param, severity_param, message_param, 
    context_param, source_param, stack_trace_param
  );
END;
$$ LANGUAGE plpgsql;

-- =======================================
-- VIEWS
-- =======================================

-- User permissions view
CREATE OR REPLACE VIEW ggr_user_permissions AS
SELECT DISTINCT 
  u.id as user_id,
  u.email,
  r.name as role_name,
  p.name as permission_name
FROM ggr_users u
JOIN ggr_user_roles ur ON u.id = ur.user_id AND ur.is_active = true
JOIN ggr_roles r ON ur.role_id = r.id AND r.is_active = true  
JOIN ggr_role_permissions rp ON r.id = rp.role_id
JOIN ggr_permissions p ON rp.permission_id = p.id AND p.is_active = true
WHERE u.is_active = true
  AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP);

-- =======================================
-- DEFAULT DATA
-- =======================================

-- Insert default roles
INSERT INTO ggr_roles (name, display_name, description, is_system) VALUES 
  ('admin', 'Administrator', 'Full system access with all permissions', true),
  ('manager', 'Manager', 'Manage requests, users, and system settings', true),
  ('moderator', 'Moderator', 'Moderate requests and user content', true),
  ('user', 'User', 'Standard user with basic permissions', true),
  ('viewer', 'Viewer', 'Read-only access to public content', true)
ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system;

-- Insert default permissions
INSERT INTO ggr_permissions (name, display_name, description, category) VALUES 
  -- User Management
  ('user.view', 'View Users', 'View user profiles and information', 'user_management'),
  ('user.create', 'Create Users', 'Create new user accounts', 'user_management'),
  ('user.edit', 'Edit Users', 'Edit user profiles and information', 'user_management'),
  ('user.delete', 'Delete Users', 'Delete user accounts', 'user_management'),
  ('user.ban', 'Ban Users', 'Ban or suspend user accounts', 'user_management'),
  ('user.manage', 'Manage Users', 'Full user management including password resets', 'user_management'),
  
  -- Request Management
  ('request.view_own', 'View Own Requests', 'View own submitted requests', 'request_management'),
  ('request.view_all', 'View All Requests', 'View all user requests', 'request_management'),
  ('request.create', 'Create Requests', 'Submit new game requests', 'request_management'),
  ('request.edit_own', 'Edit Own Requests', 'Edit own submitted requests', 'request_management'),
  ('request.edit', 'Edit Requests', 'Edit game requests', 'request_management'),
  ('request.manage', 'Manage Requests', 'Full request management capabilities', 'request_management'),
  ('request.approve', 'Approve Requests', 'Approve or reject requests', 'request_management'),
  ('request.reject', 'Reject Requests', 'Reject requests', 'request_management'),
  
  -- Game Management
  ('game.view', 'View Games', 'View game information', 'game_management'),
  ('game.search', 'Search Games', 'Search for games', 'game_management'),
  ('game.add_to_watchlist', 'Add to Watchlist', 'Add games to personal watchlist', 'game_management'),
  
  -- System Management
  ('admin.panel', 'Access Admin Panel', 'Access to administration panel', 'system_management'),
  ('system.settings', 'System Settings', 'Manage system configuration', 'system_management'),
  ('analytics.view', 'View Analytics', 'View usage analytics and reports', 'analytics'),
  ('navigation.manage', 'Manage Navigation', 'Manage custom navigation links', 'system_management')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
WITH role_permission_mapping AS (
  SELECT 
    r.id as role_id, 
    p.id as permission_id
  FROM ggr_roles r
  CROSS JOIN ggr_permissions p
  WHERE 
    -- Admin gets all permissions
    (r.name = 'admin') OR
    
    -- Manager gets most permissions
    (r.name = 'manager' AND p.name NOT IN ('user.delete', 'user.ban')) OR
    
    -- Moderator gets content and request management permissions
    (r.name = 'moderator' AND p.category IN ('request_management') 
     AND p.name NOT IN ('request.manage')) OR
    
    -- User gets basic permissions
    (r.name = 'user' AND p.name IN (
      'request.view_own', 'request.create', 'request.edit_own',
      'game.view', 'game.search', 'game.add_to_watchlist'
    )) OR
    
    -- Viewer gets read-only permissions
    (r.name = 'viewer' AND p.name IN ('game.view', 'game.search', 'request.view_own'))
)
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT role_id, permission_id FROM role_permission_mapping
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Insert default system settings
INSERT INTO ggr_system_settings (key, value, description) VALUES 
  ('site_title', 'G.G Requestz', 'Website title displayed in navigation'),
  ('site_description', 'Game Request Management System', 'Website description'),
  ('max_requests_per_user', '50', 'Maximum number of requests per user'),
  ('enable_user_registration', 'false', 'Allow new user registration'),
  ('require_admin_approval', 'true', 'Require admin approval for new requests'),
  ('default_user_role', 'viewer', 'Default role assigned to new users'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('analytics_enabled', 'true', 'Enable user analytics tracking'),
  ('cache_ttl_hours', '24', 'Cache time-to-live in hours'),
  ('gotify.notifications.new_requests', 'true', 'Send notifications for new game requests'),
  ('gotify.notifications.status_changes', 'true', 'Send notifications for request status changes'),
  ('gotify.notifications.admin_actions', 'false', 'Send notifications for admin actions')
ON CONFLICT (key) DO NOTHING;

-- Log initialization completion
SELECT log_system_event(
  'database_initialized',
  'Complete database schema initialized for Docker deployment',
  'info',
  jsonb_build_object('version', 'docker-init-v1.0'),
  'database_initialization'
);

-- Record the initialization and mark all migrations as completed for fresh install
INSERT INTO ggr_migrations (migration_name, executed_at, success) VALUES
('docker_initialization', CURRENT_TIMESTAMP, true),
('001_complete_schema', CURRENT_TIMESTAMP, true),
('002_additional_features', CURRENT_TIMESTAMP, true),
('003_hierarchical_navigation', CURRENT_TIMESTAMP, true)
ON CONFLICT (migration_name) DO NOTHING;