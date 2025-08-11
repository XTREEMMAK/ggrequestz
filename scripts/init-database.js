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
-- GG Requestz Database Schema - Unified
-- Complete database setup with all tables, indexes, triggers, and initial data
-- Supports both OIDC and Basic Authentication

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
  version INTEGER NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time INTEGER, -- milliseconds
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  checksum VARCHAR(64) -- SHA256 of migration content
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
  platforms JSONB DEFAULT '[]'::jsonb,
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
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  is_sensitive BOOLEAN DEFAULT FALSE,
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
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON ggr_system_settings(category);
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
  -- For tables with updated_at column
  IF TG_TABLE_NAME != 'ggr_games_cache' THEN
    NEW.updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Separate trigger function for games cache table
CREATE OR REPLACE FUNCTION update_games_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = CURRENT_TIMESTAMP;
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
  FOR EACH ROW EXECUTE FUNCTION update_games_cache_timestamp();

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
      // Insert default roles
      await client.query(`
        INSERT INTO ggr_roles (name, display_name, description, is_system) VALUES 
        ('admin', 'Administrator', 'Full system access with all permissions', true),
        ('manager', 'Manager', 'Manage requests, users, and system settings', true),
        ('moderator', 'Moderator', 'Moderate requests and user content', true),
        ('user', 'User', 'Standard user with basic permissions', true),
        ('viewer', 'Viewer', 'Read-only access to public content', true)
        ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system;
      `);

      // Insert default permissions
      await client.query(`
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
      `);

      // Assign permissions to roles using the complex mapping from docker-init.sql
      await client.query(`
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
      `);

      // Insert default system settings
      await client.query(`
        INSERT INTO ggr_system_settings (key, value, category, description, is_sensitive) VALUES 
        ('site_title', 'G.G Requestz', 'general', 'Website title displayed in navigation', FALSE),
        ('site_description', 'Game Request Management System', 'general', 'Website description', FALSE),
        ('max_requests_per_user', '50', 'requests', 'Maximum number of requests per user', FALSE),
        ('enable_user_registration', 'false', 'authentication', 'Allow new user registration', FALSE),
        ('require_admin_approval', 'true', 'requests', 'Require admin approval for new requests', FALSE),
        ('default_user_role', 'viewer', 'authentication', 'Default role assigned to new users', FALSE),
        ('maintenance_mode', 'false', 'system', 'Enable maintenance mode', FALSE),
        ('analytics_enabled', 'true', 'system', 'Enable user analytics tracking', FALSE),
        ('cache_ttl_hours', '24', 'system', 'Cache time-to-live in hours', FALSE),
        ('gotify.notifications.new_requests', 'true', 'notifications', 'Send notifications for new game requests', FALSE),
        ('gotify.notifications.status_changes', 'true', 'notifications', 'Send notifications for request status changes', FALSE),
        ('gotify.notifications.admin_actions', 'false', 'notifications', 'Send notifications for admin actions', FALSE),
        ('gotify.url', '', 'notifications', 'Gotify server URL for push notifications', FALSE),
        ('gotify.token', '', 'notifications', 'Gotify application token for sending notifications', TRUE),
        ('romm.server_url', '', 'integrations', 'ROMM server URL for game library integration', FALSE),
        ('romm.username', '', 'integrations', 'ROMM username for authentication', FALSE),
        ('romm.password', '', 'integrations', 'ROMM password for authentication', TRUE)
        ON CONFLICT (key) DO NOTHING;
      `);

      // Log initialization completion
      await client.query(`
        SELECT log_system_event(
          'database_initialized',
          'Complete database schema initialized for unified deployment',
          'info',
          jsonb_build_object('version', 'unified-init-v1.0'),
          'database_initialization'
        );
      `);

      // Record the initialization and mark migrations as completed for fresh install
      await client.query(`
        INSERT INTO ggr_migrations (migration_name, version, executed_at, execution_time, success, checksum) VALUES
        ('unified_initialization', 0, CURRENT_TIMESTAMP, 0, true, 'init'),
        ('001_complete_schema', 1, CURRENT_TIMESTAMP, 0, true, 'init'),
        ('002_additional_features', 2, CURRENT_TIMESTAMP, 0, true, 'init'),
        ('003_hierarchical_navigation', 3, CURRENT_TIMESTAMP, 0, true, 'init')
        ON CONFLICT (migration_name) DO NOTHING;
      `);
      
      console.log("✅ Initial data inserted successfully");
    } catch (err) {
      console.log("⚠️  Some initial data may already exist:", err.message);
    }

    // Verify tables were created
    console.log("🔍 Verifying table creation...");

    const tables = [
      "ggr_migrations",
      "ggr_users",
      "ggr_roles",
      "ggr_permissions",
      "ggr_role_permissions",
      "ggr_user_roles",
      "ggr_games_cache",
      "ggr_game_requests", 
      "ggr_user_watchlist",
      "ggr_custom_navigation",
      "ggr_system_settings",
      "ggr_user_analytics",
      "ggr_audit_log",
      "ggr_system_events"
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
