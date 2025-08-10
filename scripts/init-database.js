#!/usr/bin/env node

/**
 * Database initialization script for GG Requestz
 * Sets up PostgreSQL database with ggr_ tables
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import pkg from "pg";
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

/**
 * Split SQL statements intelligently, handling PostgreSQL functions with dollar-quoted strings
 * @param {string} sql - SQL content
 * @returns {Array} - Array of SQL statements
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = "";
  let inDollarQuote = false;
  let dollarQuoteTag = "";
  let inFunction = false;
  let inCreateTable = false;

  const lines = sql.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip comments and empty lines
    if (trimmedLine.length === 0 || trimmedLine.startsWith("--")) {
      continue;
    }

    // Check for start of function
    if (
      trimmedLine.toUpperCase().startsWith("CREATE OR REPLACE FUNCTION") ||
      trimmedLine.toUpperCase().startsWith("CREATE FUNCTION")
    ) {
      inFunction = true;
    }

    // Check for start of CREATE TABLE
    if (trimmedLine.toUpperCase().startsWith("CREATE TABLE")) {
      inCreateTable = true;
    }

    // Check for dollar-quoted strings
    const dollarMatches = line.match(/\$([^$]*)\$/g);
    if (dollarMatches) {
      for (const match of dollarMatches) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarQuoteTag = match;
        } else if (match === dollarQuoteTag) {
          inDollarQuote = false;
          dollarQuoteTag = "";
        }
      }
    }

    currentStatement += line + "\n";

    // Check for end of statement
    if (trimmedLine.endsWith(";") && !inDollarQuote) {
      if (inFunction) {
        // End of function detected by language clause usually at statement end
        if (/\bLANGUAGE\b/i.test(trimmedLine)) {
          inFunction = false;
        }
      } else if (inCreateTable) {
        // End of CREATE TABLE statement (detected by semicolon)
        inCreateTable = false;
      }

      // If we're not inside a function, dollar quote, or create table, statement ends here
      if (!inFunction && !inDollarQuote && !inCreateTable) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        currentStatement = "";
      }
    }
  }

  // Add any remaining statement
  if (currentStatement.trim().length > 0) {
    statements.push(currentStatement.trim());
  }

  return statements;
}



// Create PostgreSQL client for database initialization
function getDbClient() {
  const dbConfig = {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD,
  };

  if (!dbConfig.password) {
    throw new Error("Missing required environment variable: POSTGRES_PASSWORD");
  }

  return new Client(dbConfig);
}

async function initializeDatabase() {
  console.log("🚀 Initializing GG Requestz database...");

  const client = getDbClient();

  try {
    await client.connect();
    console.log("✅ Connected to PostgreSQL database");

    console.log("📄 Executing consolidated database schema...");

    // Consolidated database schema - all tables, indexes, and data in one place
    const consolidatedSQL = `
-- GG Requestz Database Schema - Consolidated
-- Complete database setup with all tables, indexes, triggers, and initial data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Games cache table - stores IGDB game data locally
CREATE TABLE IF NOT EXISTS ggr_games_cache (
    igdb_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    cover_url TEXT,
    rating DECIMAL,
    release_date TIMESTAMP,
    platforms JSONB DEFAULT '[]'::jsonb,
    genres JSONB DEFAULT '[]'::jsonb,
    screenshots JSONB DEFAULT '[]'::jsonb,
    videos JSONB DEFAULT '[]'::jsonb,
    companies JSONB DEFAULT '[]'::jsonb,
    game_modes JSONB DEFAULT '[]'::jsonb,
    popularity_score INTEGER DEFAULT 0,
    cached_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Game requests table
CREATE TABLE IF NOT EXISTS ggr_game_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    user_name TEXT,
    request_type TEXT NOT NULL CHECK (request_type IN ('game', 'update', 'fix')),
    title TEXT NOT NULL,
    igdb_id TEXT,
    platforms JSONB DEFAULT '[]'::jsonb,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    description TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User watchlist table
CREATE TABLE IF NOT EXISTS ggr_user_watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    igdb_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, igdb_id)
);

-- User analytics table
CREATE TABLE IF NOT EXISTS ggr_user_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Users table - stores user profiles from Authentik authentication
CREATE TABLE IF NOT EXISTS ggr_users (
    id SERIAL PRIMARY KEY,
    authentik_sub TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    preferred_username TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- ROLES AND PERMISSIONS SYSTEM
-- ============================================================================

-- Roles table - predefined roles with descriptions
CREATE TABLE IF NOT EXISTS ggr_roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Permissions table - granular permissions
CREATE TABLE IF NOT EXISTS ggr_permissions (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Role-Permission junction table
CREATE TABLE IF NOT EXISTS ggr_role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES ggr_roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES ggr_permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- User-Role junction table (users can have multiple roles)
CREATE TABLE IF NOT EXISTS ggr_user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES ggr_users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES ggr_roles(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES ggr_users(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- System settings table for admin configurable settings
CREATE TABLE IF NOT EXISTS ggr_system_settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    category TEXT DEFAULT 'general',
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    updated_by INTEGER REFERENCES ggr_users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- PLATFORM LINKS SYSTEM
-- ============================================================================

-- Platform links table - stores platform-specific store URLs and metadata
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
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    supports_search BOOLEAN DEFAULT TRUE,
    supports_direct_links BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(platform_name, store_name)
);

-- Game-specific platform links - for storing actual discovered store URLs
CREATE TABLE IF NOT EXISTS ggr_game_platform_links (
    id SERIAL PRIMARY KEY,
    igdb_id TEXT NOT NULL,
    platform_name TEXT NOT NULL,
    store_name TEXT NOT NULL,
    store_url TEXT NOT NULL,
    store_id TEXT,
    price_info JSONB,
    is_verified BOOLEAN DEFAULT FALSE,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(igdb_id, platform_name, store_name)
);

-- Custom navigation links table - admin-controlled navigation items
CREATE TABLE IF NOT EXISTS ggr_custom_navigation (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    href TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'heroicons:link',
    position INTEGER DEFAULT 100,
    is_external BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES ggr_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Update trigger for updated_at fields
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
DO $$ BEGIN
    -- Game requests trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_game_requests_updated_at') THEN
        CREATE TRIGGER update_ggr_game_requests_updated_at 
            BEFORE UPDATE ON ggr_game_requests 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Users trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_users_updated_at') THEN
        CREATE TRIGGER update_ggr_users_updated_at 
            BEFORE UPDATE ON ggr_users 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Roles trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_roles_updated_at') THEN
        CREATE TRIGGER update_ggr_roles_updated_at 
            BEFORE UPDATE ON ggr_roles 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- System settings trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_system_settings_updated_at') THEN
        CREATE TRIGGER update_ggr_system_settings_updated_at 
            BEFORE UPDATE ON ggr_system_settings 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Platform links triggers
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_platform_links_updated_at') THEN
        CREATE TRIGGER update_ggr_platform_links_updated_at 
            BEFORE UPDATE ON ggr_platform_links 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_game_platform_links_updated_at') THEN
        CREATE TRIGGER update_ggr_game_platform_links_updated_at 
            BEFORE UPDATE ON ggr_game_platform_links 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Custom navigation trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ggr_custom_navigation_updated_at') THEN
        CREATE TRIGGER update_ggr_custom_navigation_updated_at 
            BEFORE UPDATE ON ggr_custom_navigation 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Games cache indexes
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_title ON ggr_games_cache(title);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_popularity ON ggr_games_cache(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_release_date ON ggr_games_cache(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_needs_refresh ON ggr_games_cache(needs_refresh) WHERE needs_refresh = TRUE;
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_cached_at ON ggr_games_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_ggr_games_cache_search ON ggr_games_cache USING gin(to_tsvector('english', title || ' ' || COALESCE(summary, '')));
CREATE INDEX IF NOT EXISTS idx_games_cache_title_gin ON ggr_games_cache USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_games_cache_summary_gin ON ggr_games_cache USING gin(to_tsvector('english', summary));
CREATE INDEX IF NOT EXISTS idx_games_cache_popularity ON ggr_games_cache (popularity_score DESC) WHERE popularity_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_cache_release_date ON ggr_games_cache (release_date DESC) WHERE release_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_cache_updated ON ggr_games_cache (last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_games_cache_composite ON ggr_games_cache (popularity_score DESC, last_updated DESC) WHERE popularity_score IS NOT NULL;

-- Game requests indexes
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_user_id ON ggr_game_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_status ON ggr_game_requests(status);
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_created_at ON ggr_game_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ggr_game_requests_igdb_id ON ggr_game_requests(igdb_id);

-- User watchlist indexes
CREATE INDEX IF NOT EXISTS idx_ggr_user_watchlist_user_id ON ggr_user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_watchlist_igdb_id ON ggr_user_watchlist(igdb_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_added_at ON ggr_user_watchlist (added_at DESC);

-- User analytics indexes
CREATE INDEX IF NOT EXISTS idx_ggr_user_analytics_user_id ON ggr_user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_analytics_action ON ggr_user_analytics(action);
CREATE INDEX IF NOT EXISTS idx_ggr_user_analytics_timestamp ON ggr_user_analytics(timestamp DESC);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_ggr_users_authentik_sub ON ggr_users(authentik_sub);
CREATE INDEX IF NOT EXISTS idx_ggr_users_email ON ggr_users(email);
CREATE INDEX IF NOT EXISTS idx_ggr_users_last_login ON ggr_users(last_login DESC);
CREATE INDEX IF NOT EXISTS idx_ggr_users_is_active ON ggr_users(is_active) WHERE is_active = TRUE;

-- Roles and permissions indexes
CREATE INDEX IF NOT EXISTS idx_ggr_role_permissions_role_id ON ggr_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_ggr_role_permissions_permission_id ON ggr_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_roles_user_id ON ggr_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_roles_role_id ON ggr_user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_ggr_user_roles_active ON ggr_user_roles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ggr_system_settings_key ON ggr_system_settings(key);
CREATE INDEX IF NOT EXISTS idx_ggr_system_settings_category ON ggr_system_settings(category);

-- Platform links indexes
CREATE INDEX IF NOT EXISTS idx_ggr_platform_links_platform_name ON ggr_platform_links(platform_name);
CREATE INDEX IF NOT EXISTS idx_ggr_platform_links_active ON ggr_platform_links(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ggr_platform_links_priority ON ggr_platform_links(priority DESC);
CREATE INDEX IF NOT EXISTS idx_ggr_game_platform_links_igdb_id ON ggr_game_platform_links(igdb_id);
CREATE INDEX IF NOT EXISTS idx_ggr_game_platform_links_platform ON ggr_game_platform_links(platform_name);
CREATE INDEX IF NOT EXISTS idx_ggr_game_platform_links_verified ON ggr_game_platform_links(is_verified) WHERE is_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_ggr_game_platform_links_last_checked ON ggr_game_platform_links(last_checked);

-- Custom navigation indexes
CREATE INDEX IF NOT EXISTS idx_ggr_custom_navigation_active_position ON ggr_custom_navigation(is_active, position) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ggr_custom_navigation_created_by ON ggr_custom_navigation(created_by);

-- ============================================================================
-- HELPER FUNCTIONS AND VIEWS
-- ============================================================================

-- Helper function to get platform links for a game
CREATE OR REPLACE FUNCTION get_game_platform_links(game_igdb_id TEXT, game_platforms TEXT[])
RETURNS TABLE (
    platform_name TEXT,
    platform_display_name TEXT,
    store_name TEXT,
    store_url TEXT,
    icon_name TEXT,
    icon_color TEXT,
    is_direct_link BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    -- First, return any direct game links we have stored
    SELECT 
        gpl.platform_name,
        pl.platform_display_name,
        gpl.store_name,
        gpl.store_url,
        pl.icon_name,
        pl.icon_color,
        TRUE as is_direct_link
    FROM ggr_game_platform_links gpl
    JOIN ggr_platform_links pl ON gpl.platform_name = pl.platform_name AND gpl.store_name = pl.store_name
    WHERE gpl.igdb_id = game_igdb_id 
    AND gpl.store_url IS NOT NULL 
    AND pl.is_active = TRUE
    
    UNION ALL
    
    -- Then, return search links for platforms that match the game's platforms
    SELECT 
        pl.platform_name,
        pl.platform_display_name,
        pl.store_name,
        pl.search_url_template,
        pl.icon_name,
        pl.icon_color,
        FALSE as is_direct_link
    FROM ggr_platform_links pl
    WHERE pl.is_active = TRUE 
    AND pl.supports_search = TRUE
    AND pl.search_url_template IS NOT NULL
    AND (
        -- Match platform names (case insensitive, partial matches)
        EXISTS (
            SELECT 1 FROM unnest(game_platforms) as gp
            WHERE LOWER(gp) LIKE '%' || LOWER(pl.platform_name) || '%'
               OR LOWER(pl.platform_display_name) LIKE '%' || LOWER(gp) || '%'
        )
        -- Always include major PC platforms for PC games
        OR (pl.platform_name IN ('steam', 'epic', 'gog') AND 'PC' = ANY(game_platforms))
    )
    -- Avoid duplicates from direct links
    AND NOT EXISTS (
        SELECT 1 FROM ggr_game_platform_links gpl2 
        WHERE gpl2.igdb_id = game_igdb_id 
        AND gpl2.platform_name = pl.platform_name 
        AND gpl2.store_name = pl.store_name
    )
    
    ORDER BY is_direct_link DESC, 
             (CASE 
                WHEN pl.platform_name IN ('steam', 'playstation', 'xbox', 'nintendo') THEN 100
                WHEN pl.platform_name IN ('epic', 'gog') THEN 90
                ELSE 50 
              END) DESC,
             pl.platform_display_name;
END;
$$ LANGUAGE plpgsql;

-- User permissions helper view
CREATE OR REPLACE VIEW ggr_user_permissions AS
SELECT DISTINCT
    u.id as user_id,
    u.authentik_sub,
    u.email,
    r.name as role_name,
    p.name as permission_name,
    p.display_name as permission_display_name,
    p.category as permission_category
FROM ggr_users u
JOIN ggr_user_roles ur ON u.id = ur.user_id
JOIN ggr_roles r ON ur.role_id = r.id  
JOIN ggr_role_permissions rp ON r.id = rp.role_id
JOIN ggr_permissions p ON rp.permission_id = p.id
WHERE ur.is_active = TRUE 
AND r.is_active = TRUE 
AND p.is_active = TRUE
AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
`;

    // Split the consolidated SQL into statements
    const statements = splitSQLStatements(consolidatedSQL);

    let successCount = 0;

    for (const statement of statements) {
      if (statement.trim().length === 0) continue;

      console.log(`Executing: ${statement.substring(0, 60)}...`);

      try {
        await client.query(statement);
        successCount++;
      } catch (err) {
        if (err.message?.includes("already exists")) {
          console.log(`✅ Already exists: ${statement.substring(0, 50)}...`);
          successCount++;
        } else {
          console.error(`❌ Error executing statement: ${err.message}`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(`✅ Migration completed: ${successCount} statements processed`);

    // Insert initial data after schema creation
    console.log("📄 Inserting initial data...");
    
    try {
      // Insert default roles (ignore duplicates)
      await client.query(`
        INSERT INTO ggr_roles (name, display_name, description) VALUES
        ('admin', 'Administrator', 'Full system access with all permissions'),
        ('manager', 'Manager', 'Can manage requests and users with limited system access'),
        ('viewer', 'Viewer', 'Read-only access to most content')
        ON CONFLICT (name) DO NOTHING;
      `);
      
      // Insert default permissions (ignore duplicates)
      await client.query(`
        INSERT INTO ggr_permissions (name, display_name, description, category) VALUES
        ('request.create', 'Create Requests', 'Can submit new game requests', 'requests'),
        ('request.edit', 'Edit Requests', 'Can edit existing requests', 'requests'),
        ('request.delete', 'Delete Requests', 'Can remove/cancel requests', 'requests'),
        ('request.approve', 'Approve Requests', 'Can approve pending requests', 'requests'),
        ('request.view_all', 'View All Requests', 'Can view all user requests', 'requests'),
        ('user.view', 'View Users', 'Can view user list and profiles', 'users'),
        ('user.edit', 'Edit Users', 'Can modify user information and roles', 'users'),
        ('user.ban', 'Ban Users', 'Can ban/suspend user accounts', 'users'),
        ('user.delete', 'Delete Users', 'Can permanently remove users', 'users'),
        ('system.settings', 'System Settings', 'Can modify system configuration', 'system'),
        ('admin.panel', 'Admin Panel Access', 'Can access administrative interface', 'system'),
        ('analytics.view', 'View Analytics', 'Can view system analytics and reports', 'system')
        ON CONFLICT (name) DO NOTHING;
      `);
      
      // Assign permissions to roles (admin gets all)
      await client.query(`
        INSERT INTO ggr_role_permissions (role_id, permission_id)
        SELECT r.id, p.id 
        FROM ggr_roles r, ggr_permissions p 
        WHERE r.name = 'admin'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
      `);
      
      // Manager gets most permissions except system settings and user deletion
      await client.query(`
        INSERT INTO ggr_role_permissions (role_id, permission_id)
        SELECT r.id, p.id 
        FROM ggr_roles r, ggr_permissions p 
        WHERE r.name = 'manager' 
        AND p.name NOT IN ('system.settings', 'user.delete')
        ON CONFLICT (role_id, permission_id) DO NOTHING;
      `);
      
      // Viewer gets basic permissions
      await client.query(`
        INSERT INTO ggr_role_permissions (role_id, permission_id)
        SELECT r.id, p.id 
        FROM ggr_roles r, ggr_permissions p 
        WHERE r.name = 'viewer' 
        AND p.name IN ('request.create', 'request.view_all', 'user.view')
        ON CONFLICT (role_id, permission_id) DO NOTHING;
      `);
      
      // Insert default system settings
      await client.query(`
        INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive) VALUES
        ('gotify.url', '', 'notifications', 'Gotify server URL for push notifications', FALSE),
        ('gotify.token', '', 'notifications', 'Gotify application token for sending notifications', TRUE),
        ('romm.server_url', '', 'integrations', 'ROMM server URL for game library integration', FALSE),
        ('romm.username', '', 'integrations', 'ROMM username for authentication', FALSE),
        ('romm.password', '', 'integrations', 'ROMM password for authentication', TRUE),
        ('request.auto_approve', 'false', 'requests', 'Automatically approve all new requests', FALSE),
        ('request.require_approval', 'true', 'requests', 'Require admin approval for requests', FALSE),
        ('system.maintenance_mode', 'false', 'system', 'Enable maintenance mode to restrict access', FALSE),
        ('system.registration_enabled', 'true', 'system', 'Allow new user registration', FALSE)
        ON CONFLICT (key) DO NOTHING;
      `);
      
      // Insert default platform links
      await client.query(`
        INSERT INTO ggr_platform_links (platform_name, platform_display_name, store_name, base_url, search_url_template, icon_name, icon_color, priority, supports_search, supports_direct_links) VALUES
        ('steam', 'Steam', 'Steam Store', 'https://store.steampowered.com', 'https://store.steampowered.com/search/?term={query}', 'simple-icons:steam', 'text-blue-600 hover:text-blue-700', 100, TRUE, TRUE),
        ('epic', 'Epic Games', 'Epic Games Store', 'https://store.epicgames.com', 'https://store.epicgames.com/en-US/browse?q={query}', 'simple-icons:epicgames', 'text-gray-800 hover:text-gray-900', 90, TRUE, FALSE),
        ('gog', 'GOG', 'GOG.com', 'https://www.gog.com', 'https://www.gog.com/games?search={query}', 'simple-icons:gog-dot-com', 'text-purple-600 hover:text-purple-700', 85, TRUE, FALSE),
        ('playstation', 'PlayStation', 'PlayStation Store', 'https://store.playstation.com', 'https://store.playstation.com/en-us/search/{query}', 'simple-icons:playstation', 'text-blue-700 hover:text-blue-800', 95, TRUE, FALSE),
        ('xbox', 'Xbox', 'Xbox Store', 'https://www.xbox.com', 'https://www.xbox.com/en-us/games/store/search?q={query}', 'simple-icons:xbox', 'text-green-600 hover:text-green-700', 95, TRUE, FALSE),
        ('nintendo', 'Nintendo Switch', 'Nintendo eShop', 'https://www.nintendo.com', 'https://www.nintendo.com/us/search/?q={query}', 'simple-icons:nintendo', 'text-red-600 hover:text-red-700', 95, TRUE, FALSE)
        ON CONFLICT (platform_name, store_name) DO NOTHING;
      `);
      
      // Insert sample custom navigation (disabled by default)
      await client.query(`
        INSERT INTO ggr_custom_navigation (name, href, icon, position, is_external, is_active) VALUES
        ('Documentation', 'https://docs.example.com', 'heroicons:book-open', 90, TRUE, FALSE),
        ('Support', 'https://support.example.com', 'heroicons:question-mark-circle', 95, TRUE, FALSE)
        ON CONFLICT DO NOTHING;
      `);
      
      console.log("✅ Initial data inserted successfully");
    } catch (err) {
      console.log("⚠️  Some initial data may already exist:", err.message);
    }

    // Verify tables were created
    console.log("🔍 Verifying table creation...");

    const tables = [
      "ggr_games_cache",
      "ggr_game_requests", 
      "ggr_user_watchlist",
      "ggr_user_analytics",
      "ggr_users",
      "ggr_roles",
      "ggr_permissions",
      "ggr_role_permissions",
      "ggr_user_roles",
      "ggr_system_settings",
      "ggr_platform_links",
      "ggr_game_platform_links",
      "ggr_custom_navigation"
    ];

    for (const table of tables) {
      try {
        const result = await client.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
          [table],
        );

        if (result.rows[0].exists) {
          console.log(`✅ Table ${table} exists`);
        } else {
          console.error(`❌ Table ${table} not found`);
        }
      } catch (error) {
        console.error(`❌ Error checking table ${table}:`, error.message);
      }
    }

    // Run ANALYZE for better query planning
    console.log("📊 Analyzing tables for query optimization...");
    try {
      await client.query('ANALYZE ggr_games_cache');
      await client.query('ANALYZE ggr_game_requests');
      await client.query('ANALYZE ggr_user_watchlist');
      await client.query('ANALYZE ggr_users');
      console.log("✅ Table analysis completed");
    } catch (err) {
      console.log("⚠️  Table analysis failed:", err.message);
    }

    console.log("🎉 Database initialization completed!");
    console.log("\n📋 Next steps:");
    console.log("1. Verify your .env file has correct PostgreSQL credentials");
    console.log("2. Run the application: npm run dev");
    console.log("3. The cache will populate automatically as users browse games");
    console.log("4. Access admin panel to configure system settings");
    console.log("5. Migration files have been consolidated - you can remove the /migrations directory");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);

    if (error.message?.includes("connect")) {
      console.log("\n💡 Connection tips:");
      console.log(
        "- Make sure your PostgreSQL credentials are correct in .env",
      );
      console.log("- Check that PostgreSQL is running");
      console.log("- Verify network connectivity to your PostgreSQL server");
    }

    process.exit(1);
  } finally {
    await client.end();
  }
}

// Add some helper functions for manual operations
async function warmUpCache() {
  console.log("🔥 Warming up games cache...");

  try {
    // Import the cache warming function
    const { warmUpCache } = await import("../src/lib/gameCache.js");
    await warmUpCache();
    console.log("✅ Cache warm-up completed");
  } catch (error) {
    console.error("❌ Cache warm-up failed:", error);
  }
}

async function checkCacheStats() {
  console.log("📊 Checking cache statistics...");

  try {
    const client = getDbClient();
    await client.connect();

    const result = await client.query(
      "SELECT COUNT(*) as total_games FROM ggr_games_cache",
    );

    const popularResult = await client.query(
      "SELECT COUNT(*) as popular_games FROM ggr_games_cache WHERE popularity_score > 0",
    );

    const recentResult = await client.query(
      "SELECT COUNT(*) as recent_games FROM ggr_games_cache WHERE release_date > NOW() - INTERVAL '1 year'",
    );

    const staleResult = await client.query(
      "SELECT COUNT(*) as stale_games FROM ggr_games_cache WHERE last_updated < NOW() - INTERVAL '1 day'",
    );

    // Sample platforms data to understand format
    const sampleResult = await client.query(
      "SELECT title, platforms, genres FROM ggr_games_cache LIMIT 3",
    );

    console.log("Cache Statistics:");
    console.log(`- Total Games: ${result.rows[0].total_games}`);
    console.log(`- Popular Games: ${popularResult.rows[0].popular_games}`);
    console.log(`- Recent Games: ${recentResult.rows[0].recent_games}`);
    console.log(`- Stale Games: ${staleResult.rows[0].stale_games}`);

    console.log("\nSample data:");
    sampleResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.title}`);
      console.log(`   Platforms: ${typeof row.platforms} - ${row.platforms}`);
      console.log(`   Genres: ${typeof row.genres} - ${row.genres}`);
    });

    await client.end();
  } catch (error) {
    console.error("❌ Failed to get cache stats:", error);
  }
}

async function syncToTypesense() {
  console.log("🔍 Syncing games from database to Typesense...");

  try {
    // Create direct database client (bypassing SvelteKit database module)
    const client = getDbClient();
    await client.connect();

    const result = await client.query(
      "SELECT * FROM ggr_games_cache ORDER BY last_updated DESC",
    );

    const games = result.rows;
    console.log(`📚 Found ${games.length} games in database cache`);

    // Import Typesense functions with standalone client
    const Typesense = (await import("typesense")).default;
    const typesenseClient = new Typesense.Client({
      nodes: [
        {
          host: process.env.TYPESENSE_HOST || "localhost",
          port: parseInt(process.env.TYPESENSE_PORT) || 8108,
          protocol: process.env.TYPESENSE_PROTOCOL || "http",
        },
      ],
      apiKey: process.env.TYPESENSE_API_KEY || "xyz",
      connectionTimeoutSeconds: 2,
    });

    let syncedCount = 0;
    let errorCount = 0;

    for (const game of games) {
      try {
        await typesenseClient
          .collections("games")
          .documents()
          .upsert({
            id: game.igdb_id,
            title: game.title,
            normalized_title: game.title
              ?.toLowerCase()
              .replace(/[^\w\s]/g, "")
              .trim(),
            platforms:
              typeof game.platforms === "string"
                ? game.platforms.split(",").map((p) => p.trim())
                : Array.isArray(game.platforms)
                  ? game.platforms
                  : [],
            genres:
              typeof game.genres === "string"
                ? game.genres.split(",").map((g) => g.trim())
                : Array.isArray(game.genres)
                  ? game.genres
                  : [],
            popularity: game.popularity_score || 0,
            release_date: game.release_date
              ? new Date(game.release_date).getTime()
              : 0,
            igdb_id: game.igdb_id,
            cover_url: game.cover_url || "",
            summary: game.summary || "",
            rating: parseFloat(game.rating) || 0.0,
            status: game.status || "available",
          });
        syncedCount++;
        if (syncedCount % 10 === 0) {
          console.log(`📚 Synced ${syncedCount}/${games.length} games...`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync game ${game.title}:`, error.message);
        errorCount++;
      }
    }

    await client.end();
    console.log(
      `✅ Sync completed: ${syncedCount} games synced, ${errorCount} errors`,
    );
  } catch (error) {
    console.error("❌ Failed to sync to Typesense:", error);
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case "init":
    initializeDatabase();
    break;
  case "warm":
    warmUpCache();
    break;
  case "stats":
    checkCacheStats();
    break;
  case "sync":
    syncToTypesense();
    break;
  default:
    console.log("GG Requestz Database Management\n");
    console.log("Usage:");
    console.log(
      "  node scripts/init-database.js init   - Initialize database tables",
    );
    console.log(
      "  node scripts/init-database.js warm   - Warm up the games cache",
    );
    console.log(
      "  node scripts/init-database.js stats  - Show cache statistics",
    );
    console.log(
      "  node scripts/init-database.js sync   - Sync database games to Typesense",
    );
    console.log(
      "\nFor the initial setup, run: node scripts/init-database.js init",
    );
    break;
}
