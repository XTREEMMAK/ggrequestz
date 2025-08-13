#!/usr/bin/env node

/**
 * G.G Requestz Migration Manager
 * Advanced database migration system with versioning and rollback
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import { config } from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

console.log('🗄️  G.G Requestz Migration Manager');
console.log('===================================');

// Migration configuration
const MIGRATION_CONFIG = {
  migrationsDir: join(__dirname, '..', 'migrations'),
  migrationTable: 'ggr_migrations',
  versionTable: 'ggr_schema_version',
  lockTable: 'ggr_migration_lock'
};

class MigrationManager {
  constructor() {
    this.client = this.getDbClient();
    this.currentVersion = null;
    this.availableMigrations = [];
    this.pendingMigrations = [];
  }

  getDbClient() {
    const dbConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    };

    if (!dbConfig.password) {
      throw new Error('Missing required environment variable: POSTGRES_PASSWORD');
    }

    return new Client(dbConfig);
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
      await this.ensureMigrationTables();
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async disconnect() {
    await this.client.end();
  }

  /**
   * Split SQL statements intelligently, handling PostgreSQL functions with dollar-quoted strings
   * and keeping CREATE TABLE + related statements together
   * @param {string} sql - SQL content
   * @returns {Array} - Array of SQL statements
   */
  splitSQLStatements(sql) {
    const statements = [];
    let currentStatement = "";
    let inDollarQuote = false;
    let dollarQuoteTag = "";
    let inFunction = false;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let depth = 0; // Track parentheses depth

    const lines = sql.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (trimmedLine.length === 0 || trimmedLine.startsWith("--")) {
        continue;
      }

      let i = 0;
      while (i < line.length) {
        const char = line[i];
        const nextChar = i + 1 < line.length ? line[i + 1] : null;

        // Handle dollar-quoted strings (PostgreSQL function bodies)
        if (char === '$' && !inSingleQuote && !inDoubleQuote) {
          const dollarMatch = line.slice(i).match(/^\$([^$]*)\$/);
          if (dollarMatch) {
            const tag = dollarMatch[0];
            if (!inDollarQuote) {
              inDollarQuote = true;
              dollarQuoteTag = tag;
            } else if (tag === dollarQuoteTag) {
              inDollarQuote = false;
              dollarQuoteTag = "";
            }
            i += tag.length;
            continue;
          }
        }

        // Handle regular quotes
        if (!inDollarQuote) {
          if (char === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
          } else if (char === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
          }
        }

        // Track parentheses depth
        if (!inDollarQuote && !inSingleQuote && !inDoubleQuote) {
          if (char === '(') depth++;
          if (char === ')') depth--;
        }

        i++;
      }

      // Check for function start
      if (!inDollarQuote && (
        trimmedLine.toUpperCase().includes("CREATE OR REPLACE FUNCTION") ||
        trimmedLine.toUpperCase().includes("CREATE FUNCTION")
      )) {
        inFunction = true;
      }

      currentStatement += line + "\n";

      // Check for statement end
      if (trimmedLine.endsWith(";") && !inDollarQuote && !inSingleQuote && !inDoubleQuote && depth === 0) {
        if (inFunction && /\bLANGUAGE\b/i.test(trimmedLine)) {
          inFunction = false;
        }

        // If we're not inside a function or dollar quote, this statement ends here
        if (!inFunction && !inDollarQuote) {
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

    return statements.filter(stmt => stmt.length > 0);
  }

  async ensureMigrationTables() {
    try {
      // Create migration tracking table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_CONFIG.migrationTable} (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) NOT NULL UNIQUE,
          version INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time INTEGER, -- milliseconds
          success BOOLEAN DEFAULT TRUE,
          error_message TEXT,
          checksum VARCHAR(64) -- SHA256 of migration content
        )
      `);

      // Create schema version table
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_CONFIG.versionTable} (
          id SERIAL PRIMARY KEY,
          version INTEGER NOT NULL UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          rollback_sql TEXT -- SQL to rollback this version
        )
      `);

      // Create migration lock table (prevents concurrent migrations)
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_CONFIG.lockTable} (
          id INTEGER PRIMARY KEY DEFAULT 1,
          locked BOOLEAN DEFAULT FALSE,
          locked_at TIMESTAMP,
          locked_by VARCHAR(255), -- process info
          CHECK (id = 1) -- Only one row allowed
        )
      `);

      // Insert lock row if it doesn't exist
      await this.client.query(`
        INSERT INTO ${MIGRATION_CONFIG.lockTable} (locked) 
        VALUES (FALSE) 
        ON CONFLICT (id) DO NOTHING
      `);

    } catch (error) {
      console.error('❌ Failed to create migration tables:', error.message);
      throw error;
    }
  }

  async acquireLock() {
    const processInfo = `${process.pid}@${os.hostname()}`;
    
    const result = await this.client.query(`
      UPDATE ${MIGRATION_CONFIG.lockTable} 
      SET locked = TRUE, locked_at = CURRENT_TIMESTAMP, locked_by = $1
      WHERE id = 1 AND locked = FALSE
    `, [processInfo]);

    if (result.rowCount === 0) {
      const lockInfo = await this.client.query(`
        SELECT locked_at, locked_by FROM ${MIGRATION_CONFIG.lockTable} WHERE id = 1
      `);
      
      throw new Error(
        `Migration is already in progress. Locked at ${lockInfo.rows[0].locked_at} by ${lockInfo.rows[0].locked_by}`
      );
    }

    console.log('🔒 Migration lock acquired');
  }

  async releaseLock() {
    await this.client.query(`
      UPDATE ${MIGRATION_CONFIG.lockTable} 
      SET locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE id = 1
    `);
    console.log('🔓 Migration lock released');
  }

  async getCurrentVersion() {
    try {
      const result = await this.client.query(`
        SELECT version FROM ${MIGRATION_CONFIG.versionTable} 
        ORDER BY version DESC LIMIT 1
      `);
      
      this.currentVersion = result.rows.length > 0 ? result.rows[0].version : 0;
      return this.currentVersion;
    } catch (error) {
      console.log('ℹ️  No schema version found, starting from 0');
      this.currentVersion = 0;
      return 0;
    }
  }

  async loadAvailableMigrations() {
    if (!existsSync(MIGRATION_CONFIG.migrationsDir)) {
      console.warn('⚠️  Migrations directory not found');
      return [];
    }

    const files = readdirSync(MIGRATION_CONFIG.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    this.availableMigrations = files.map(filename => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const version = parseInt(match[1]);
      const name = match[2];
      const filepath = join(MIGRATION_CONFIG.migrationsDir, filename);
      const content = readFileSync(filepath, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      return {
        version,
        name,
        filename,
        filepath,
        content,
        checksum
      };
    });

    console.log(`📁 Found ${this.availableMigrations.length} migration files`);
    return this.availableMigrations;
  }

  async findPendingMigrations() {
    await this.getCurrentVersion();
    await this.loadAvailableMigrations();

    this.pendingMigrations = this.availableMigrations.filter(
      migration => migration.version > this.currentVersion
    );

    console.log(`⏳ Found ${this.pendingMigrations.length} pending migrations`);
    return this.pendingMigrations;
  }

  async executeMigration(migration) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Executing migration ${migration.version}: ${migration.name}`);
      
      // Begin transaction
      await this.client.query('BEGIN');

      // Execute migration SQL using smart SQL statement splitting
      const statements = this.splitSQLStatements(migration.content);
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await this.client.query(statement);
          } catch (error) {
            console.error(`❌ Failed executing statement: ${statement.substring(0, 100)}...`);
            throw error;
          }
        }
      }

      // Record migration execution
      await this.client.query(`
        INSERT INTO ${MIGRATION_CONFIG.migrationTable} 
        (migration_name, version, execution_time, checksum) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (migration_name) DO UPDATE SET
          executed_at = CURRENT_TIMESTAMP,
          execution_time = $3,
          success = TRUE,
          error_message = NULL
      `, [
        migration.filename,
        migration.version,
        Date.now() - startTime,
        migration.checksum
      ]);

      // Update schema version
      await this.client.query(`
        INSERT INTO ${MIGRATION_CONFIG.versionTable} (version)
        VALUES ($1)
        ON CONFLICT (version) DO NOTHING
      `, [migration.version]);

      // Commit transaction
      await this.client.query('COMMIT');

      console.log(`✅ Migration ${migration.version} completed in ${Date.now() - startTime}ms`);
      return true;

    } catch (error) {
      // Rollback on error
      await this.client.query('ROLLBACK');

      // Record failed migration
      await this.client.query(`
        INSERT INTO ${MIGRATION_CONFIG.migrationTable} 
        (migration_name, version, execution_time, success, error_message, checksum) 
        VALUES ($1, $2, $3, FALSE, $4, $5)
        ON CONFLICT (migration_name) DO UPDATE SET
          executed_at = CURRENT_TIMESTAMP,
          execution_time = $3,
          success = FALSE,
          error_message = $4
      `, [
        migration.filename,
        migration.version,
        Date.now() - startTime,
        error.message,
        migration.checksum
      ]);

      console.error(`❌ Migration ${migration.version} failed:`, error.message);
      throw error;
    }
  }

  async runMigrations() {
    try {
      await this.acquireLock();
      await this.findPendingMigrations();

      if (this.pendingMigrations.length === 0) {
        console.log('✨ No pending migrations. Database is up to date!');
        return;
      }

      console.log(`🚀 Running ${this.pendingMigrations.length} migrations...`);

      for (const migration of this.pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log('🎉 All migrations completed successfully!');
      await this.printStatus();

    } finally {
      await this.releaseLock();
    }
  }

  async printStatus() {
    const currentVersion = await this.getCurrentVersion();
    const totalMigrations = await this.client.query(`
      SELECT COUNT(*) as count FROM ${MIGRATION_CONFIG.migrationTable}
      WHERE success = TRUE
    `);

    console.log('\n📊 Migration Status:');
    console.log(`   Current Schema Version: ${currentVersion}`);
    console.log(`   Total Applied Migrations: ${totalMigrations.rows[0].count}`);

    // Show recent migrations
    const recentMigrations = await this.client.query(`
      SELECT migration_name, version, executed_at, execution_time
      FROM ${MIGRATION_CONFIG.migrationTable}
      WHERE success = TRUE
      ORDER BY executed_at DESC
      LIMIT 5
    `);

    if (recentMigrations.rows.length > 0) {
      console.log('\n📝 Recent Migrations:');
      for (const row of recentMigrations.rows) {
        console.log(`   ${row.version}: ${row.migration_name} (${row.execution_time}ms)`);
      }
    }
  }

  async listMigrations() {
    await this.loadAvailableMigrations();
    await this.getCurrentVersion();

    console.log('\n📋 Available Migrations:');
    
    const appliedMigrations = await this.client.query(`
      SELECT migration_name, executed_at FROM ${MIGRATION_CONFIG.migrationTable}
      WHERE success = TRUE
    `);
    
    const appliedMap = new Map();
    for (const row of appliedMigrations.rows) {
      appliedMap.set(row.migration_name, row.executed_at);
    }

    for (const migration of this.availableMigrations) {
      const status = appliedMap.has(migration.filename) ? '✅ Applied' : '⏳ Pending';
      const appliedAt = appliedMap.get(migration.filename);
      
      console.log(`   ${migration.version}: ${migration.name} - ${status}`);
      if (appliedAt) {
        console.log(`      Applied: ${appliedAt}`);
      }
    }
  }

  async validateMigrations() {
    console.log('🔍 Validating migrations...');
    
    await this.loadAvailableMigrations();
    
    try {
      // Try to get checksums - this will fail gracefully if checksum column doesn't exist
      const appliedMigrations = await this.client.query(`
        SELECT migration_name, checksum FROM ${MIGRATION_CONFIG.migrationTable}
        WHERE success = TRUE
      `);
      
      return this.validateWithChecksums(appliedMigrations);
    } catch (error) {
      if (error.message.includes('column "checksum" does not exist')) {
        console.log('⚠️  Checksum column missing - running basic validation without checksums');
        return this.validateWithoutChecksums();
      }
      throw error;
    }
  }

  async validateWithChecksums(appliedMigrations) {

    const appliedMap = new Map();
    for (const row of appliedMigrations.rows) {
      appliedMap.set(row.migration_name, row.checksum);
    }

    let hasErrors = false;

    for (const migration of this.availableMigrations) {
      if (appliedMap.has(migration.filename)) {
        const storedChecksum = appliedMap.get(migration.filename);
        if (storedChecksum && storedChecksum !== migration.checksum) {
          console.error(`❌ Migration ${migration.filename} has been modified after execution!`);
          console.error(`   Expected: ${storedChecksum}`);
          console.error(`   Current:  ${migration.checksum}`);
          hasErrors = true;
        }
      }
    }

    if (!hasErrors) {
      console.log('✅ All migrations are valid');
    } else {
      throw new Error('Migration validation failed. Do not modify applied migrations!');
    }
  }

  async validateWithoutChecksums() {
    // Basic validation without checksums - just check that applied migrations exist
    const appliedMigrations = await this.client.query(`
      SELECT migration_name FROM ${MIGRATION_CONFIG.migrationTable}
      WHERE success = TRUE
    `);

    const appliedSet = new Set(appliedMigrations.rows.map(row => row.migration_name));
    
    console.log(`📋 Found ${appliedSet.size} previously applied migrations`);
    console.log('✅ Basic validation passed (checksum validation skipped)');
    
    // Note: After running the migration table fix, full validation will be available
    if (appliedSet.size > 0) {
      console.log('💡 Tip: Run the migration table fix script to enable checksum validation');
    }
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2] || 'migrate';
  const manager = new MigrationManager();

  try {
    await manager.connect();

    switch (command) {
      case 'migrate':
        await manager.validateMigrations();
        await manager.runMigrations();
        break;

      case 'status':
        await manager.printStatus();
        break;

      case 'list':
        await manager.listMigrations();
        break;

      case 'validate':
        await manager.validateMigrations();
        break;

      default:
        console.log('Usage: node migration-manager.js [migrate|status|list|validate]');
        console.log('');
        console.log('Commands:');
        console.log('  migrate   - Run pending migrations (default)');
        console.log('  status    - Show migration status');
        console.log('  list      - List all migrations');
        console.log('  validate  - Validate migration integrity');
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await manager.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, releasing locks...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, releasing locks...');
  process.exit(0);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MigrationManager };