-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS ggr_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT true,
    checksum VARCHAR(64),
    version INTEGER,
    execution_time INTEGER,
    error_message TEXT
);

-- Create schema version table
CREATE TABLE IF NOT EXISTS ggr_schema_version (
    id SERIAL PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rollback_sql TEXT
);

-- Create migration lock table
CREATE TABLE IF NOT EXISTS ggr_migration_lock (
    id INTEGER DEFAULT 1 NOT NULL PRIMARY KEY,
    locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP,
    locked_by VARCHAR(255),
    CONSTRAINT ggr_migration_lock_id_check CHECK (id = 1)
);

-- Create roles table for role-based access control
CREATE TABLE IF NOT EXISTS ggr_roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_system BOOLEAN DEFAULT false
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS ggr_permissions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create role-permissions junction table
CREATE TABLE IF NOT EXISTS ggr_role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES ggr_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES ggr_permissions(id) ON DELETE CASCADE
);

-- Create users table for user management (supports both Authentik and local auth)
CREATE TABLE IF NOT EXISTS ggr_users (
    id SERIAL PRIMARY KEY,
    authentik_sub TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    preferred_username TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP DEFAULT NOW(),
    username VARCHAR(255),
    password_hash TEXT,
    password_changed_at TIMESTAMP DEFAULT NOW(),
    force_password_change BOOLEAN DEFAULT false
);

-- User roles junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS ggr_user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    UNIQUE(user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES ggr_users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES ggr_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES ggr_users(id)
);

-- Games cache table for storing game data
CREATE TABLE IF NOT EXISTS ggr_games_cache (
    igdb_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    cover_url TEXT,
    rating NUMERIC,
    release_date TIMESTAMP,
    platforms JSONB DEFAULT '[]',
    genres JSONB DEFAULT '[]',
    screenshots JSONB DEFAULT '[]',
    videos JSONB DEFAULT '[]',
    companies JSONB DEFAULT '[]',
    game_modes JSONB DEFAULT '[]',
    popularity_score NUMERIC(10,2) DEFAULT 0,
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    source_type VARCHAR(20) DEFAULT 'igdb_general'
);

-- Game requests table for tracking user requests
CREATE TABLE IF NOT EXISTS ggr_game_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT,
    request_type TEXT NOT NULL,
    title TEXT NOT NULL,
    igdb_id TEXT,
    platforms JSONB DEFAULT '[]',
    priority TEXT DEFAULT 'medium',
    description TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ggr_game_requests_priority_check CHECK (priority = ANY (ARRAY['low', 'medium', 'high', 'urgent'])),
    CONSTRAINT ggr_game_requests_request_type_check CHECK (request_type = ANY (ARRAY['game', 'update', 'fix'])),
    CONSTRAINT ggr_game_requests_status_check CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected', 'fulfilled', 'cancelled'])),
    FOREIGN KEY (igdb_id) REFERENCES ggr_games_cache(igdb_id)
);

-- User watchlist table for tracking games users are watching
CREATE TABLE IF NOT EXISTS ggr_user_watchlist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT NOT NULL,
    igdb_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, igdb_id),
    FOREIGN KEY (igdb_id) REFERENCES ggr_games_cache(igdb_id)
);

-- User analytics table for tracking user interactions
CREATE TABLE IF NOT EXISTS ggr_user_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Custom navigation table for admin-configured navigation links
CREATE TABLE IF NOT EXISTS ggr_custom_navigation (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    href TEXT NOT NULL,
    icon TEXT DEFAULT 'heroicons:link' NOT NULL,
    position INTEGER DEFAULT 100,
    is_external BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    visible_to_all BOOLEAN DEFAULT true,
    visible_to_guests BOOLEAN DEFAULT true,
    allowed_roles JSONB DEFAULT '[]',
    minimum_role VARCHAR(20) DEFAULT 'viewer',
    FOREIGN KEY (created_by) REFERENCES ggr_users(id)
);

-- Platform links table for platform store configurations
CREATE TABLE IF NOT EXISTS ggr_platform_links (
    id SERIAL PRIMARY KEY,
    platform_name TEXT NOT NULL,
    platform_display_name TEXT NOT NULL,
    store_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    search_url_template TEXT,
    direct_url_template TEXT,
    icon_name TEXT,
    icon_color TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    supports_search BOOLEAN DEFAULT true,
    supports_direct_links BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(platform_name, store_name)
);

-- Game platform links table for actual discovered store URLs
CREATE TABLE IF NOT EXISTS ggr_game_platform_links (
    id SERIAL PRIMARY KEY,
    igdb_id TEXT NOT NULL,
    platform_name TEXT NOT NULL,
    store_name TEXT NOT NULL,
    store_url TEXT NOT NULL,
    store_id TEXT,
    price_info JSONB,
    is_verified BOOLEAN DEFAULT false,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(igdb_id, platform_name, store_name)
);

-- System settings table
CREATE TABLE IF NOT EXISTS ggr_system_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT DEFAULT 'general',
    description TEXT,
    is_sensitive BOOLEAN DEFAULT false,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (updated_by) REFERENCES ggr_users(id)
);

-- System events table for logging
CREATE TABLE IF NOT EXISTS ggr_system_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    message TEXT NOT NULL,
    context JSONB,
    source VARCHAR(100),
    stack_trace TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ggr_system_events_severity_check CHECK (severity = ANY (ARRAY['debug', 'info', 'warning', 'error', 'critical']))
);

-- Audit log table
CREATE TABLE IF NOT EXISTS ggr_audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id INTEGER,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ggr_audit_log_action_check CHECK (action = ANY (ARRAY['INSERT', 'UPDATE', 'DELETE'])),
    FOREIGN KEY (user_id) REFERENCES ggr_users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON ggr_users(email);
CREATE INDEX IF NOT EXISTS idx_users_authentik_sub ON ggr_users(authentik_sub);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON ggr_users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON ggr_users(last_login DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON ggr_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON ggr_user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON ggr_user_roles(is_active);

CREATE INDEX IF NOT EXISTS idx_games_cache_igdb_id ON ggr_games_cache(igdb_id);
CREATE INDEX IF NOT EXISTS idx_games_cache_title ON ggr_games_cache(title);
CREATE INDEX IF NOT EXISTS idx_games_cache_release_date ON ggr_games_cache(release_date DESC) WHERE release_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_cache_popularity ON ggr_games_cache(popularity_score DESC) WHERE popularity_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_cache_needs_refresh ON ggr_games_cache(needs_refresh) WHERE needs_refresh = true;
CREATE INDEX IF NOT EXISTS idx_games_cache_search ON ggr_games_cache USING GIN(to_tsvector('english', title || ' ' || COALESCE(summary, '')));

CREATE INDEX IF NOT EXISTS idx_game_requests_igdb_id ON ggr_game_requests(igdb_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_user_id ON ggr_game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_game_requests_status ON ggr_game_requests(status);
CREATE INDEX IF NOT EXISTS idx_game_requests_created_at ON ggr_game_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_id ON ggr_user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_igdb_id ON ggr_user_watchlist(igdb_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_added_at ON ggr_user_watchlist(added_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON ggr_user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_action ON ggr_user_analytics(action);
CREATE INDEX IF NOT EXISTS idx_user_analytics_timestamp ON ggr_user_analytics(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_custom_navigation_active_position ON ggr_custom_navigation(is_active, position) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_navigation_created_by ON ggr_custom_navigation(created_by);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON ggr_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON ggr_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON ggr_audit_log(created_at DESC);

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create special trigger function for games cache
CREATE OR REPLACE FUNCTION update_games_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating timestamps
CREATE TRIGGER update_ggr_users_updated_at
    BEFORE UPDATE ON ggr_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_roles_updated_at
    BEFORE UPDATE ON ggr_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_custom_navigation_updated_at
    BEFORE UPDATE ON ggr_custom_navigation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_platform_links_updated_at
    BEFORE UPDATE ON ggr_platform_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_game_platform_links_updated_at
    BEFORE UPDATE ON ggr_game_platform_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_game_requests_updated_at
    BEFORE UPDATE ON ggr_game_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ggr_system_settings_updated_at
    BEFORE UPDATE ON ggr_system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Special trigger for games cache using different function
CREATE TRIGGER update_games_cache_updated_at
    BEFORE UPDATE ON ggr_games_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_games_cache_timestamp();

-- Create function for searching games
CREATE OR REPLACE FUNCTION search_games(
    search_query TEXT,
    limit_count INTEGER DEFAULT 20,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    igdb_id TEXT,
    title TEXT,
    summary TEXT,
    cover_url TEXT,
    release_date TIMESTAMP,
    platforms JSONB,
    genres JSONB,
    rating NUMERIC,
    relevance REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.igdb_id,
        g.title,
        g.summary,
        g.cover_url,
        g.release_date,
        g.platforms,
        g.genres,
        g.rating,
        1.0::REAL AS relevance
    FROM ggr_games_cache g
    WHERE g.title ILIKE '%' || search_query || '%'
       OR g.summary ILIKE '%' || search_query || '%'
    ORDER BY g.popularity_score DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default roles
INSERT INTO ggr_roles (name, display_name, description, is_system) VALUES
    ('admin', 'Administrator', 'Full system access', true),
    ('manager', 'Manager', 'Can manage requests and users', true),
    ('viewer', 'Viewer', 'Can view content only', true),
    ('user', 'User', 'Basic user access', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
    ('admin.*', 'Full Admin Access', 'Complete administrative access to all system functions', 'admin'),
    ('user.view', 'View Users', 'Can view user information', 'users'),
    ('user.edit', 'Edit Users', 'Can modify user information', 'users'),
    ('user.delete', 'Delete Users', 'Can delete user accounts', 'users'),
    ('request.view', 'View Requests', 'Can view game requests', 'requests'),
    ('request.create', 'Create Requests', 'Can create new game requests', 'requests'),
    ('request.edit', 'Edit Requests', 'Can modify game requests', 'requests'),
    ('request.delete', 'Delete Requests', 'Can delete game requests', 'requests'),
    ('games.view', 'View Games', 'Can view game information', 'games'),
    ('games.edit', 'Edit Games', 'Can modify game information', 'games'),
    ('system.settings', 'System Settings', 'Can modify system configuration', 'system')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to default roles
INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
WHERE r.name = 'admin' AND p.name = 'admin.*'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO ggr_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM ggr_roles r, ggr_permissions p
WHERE r.name = 'user' AND p.name IN ('request.view', 'request.create', 'games.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Insert initial schema version
INSERT INTO ggr_schema_version (version)
VALUES (1)
ON CONFLICT (version) DO NOTHING;

-- Record this migration
INSERT INTO ggr_migrations (migration_name, checksum)
VALUES ('001_initial_schema.sql', 'initial')
ON CONFLICT (migration_name) DO NOTHING;