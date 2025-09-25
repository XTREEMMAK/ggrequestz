#!/usr/bin/env node

/**
 * GG Requestz Database Manager
 * Unified database operations: initialization, migrations, maintenance
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { config } from "dotenv";
import pkg from "pg";
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database Manager Version
const DB_MANAGER_VERSION = "1.1.2";

// Load environment variables
config();

console.log("🗄️  G.G Requestz Database Manager v" + DB_MANAGER_VERSION);
console.log("==================================");

// Configuration
const CONFIG = {
  migrationsDir: join(__dirname, "..", "..", "migrations"),
  migrationTable: "ggr_migrations",
  versionTable: "ggr_schema_version",
};

/**
 * Create database client
 */
function getDbClient() {
  const client = new Client({
    host:
      process.env.POSTGRES_HOST ||
      process.env.DB_HOST ||
      process.env.SUPABASE_DB_HOST ||
      "localhost",
    port:
      process.env.POSTGRES_PORT ||
      process.env.DB_PORT ||
      process.env.SUPABASE_DB_PORT ||
      5432,
    database:
      process.env.POSTGRES_DB ||
      process.env.DB_NAME ||
      process.env.SUPABASE_DB_NAME ||
      "ggrequestz",
    user:
      process.env.POSTGRES_USER ||
      process.env.DB_USER ||
      process.env.SUPABASE_DB_USER ||
      "postgres",
    password:
      process.env.POSTGRES_PASSWORD ||
      process.env.DB_PASSWORD ||
      process.env.SUPABASE_DB_PASSWORD ||
      "password",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  return client;
}

/**
 * Split SQL statements intelligently, handling PostgreSQL functions
 */
function splitSQLStatements(sql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarTag = "";
  let inFunction = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    current += char;

    // Handle dollar quoting (PostgreSQL function bodies)
    if (char === "$" && !inSingleQuote && !inDoubleQuote) {
      if (!inDollarQuote) {
        const match = sql.substring(i).match(/^\$([^$]*)\$/);
        if (match) {
          dollarTag = match[1];
          inDollarQuote = true;
          current += match[0].substring(1);
          i += match[0].length - 1;
          continue;
        }
      } else {
        const expectedEnd = `$${dollarTag}$`;
        if (sql.substring(i).startsWith(expectedEnd)) {
          inDollarQuote = false;
          current += expectedEnd.substring(1);
          i += expectedEnd.length - 1;
          continue;
        }
      }
    }

    // Handle regular quotes
    if (!inDollarQuote) {
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    }

    // Check for function keywords
    if (!inSingleQuote && !inDoubleQuote && !inDollarQuote) {
      const remaining = sql.substring(i).toLowerCase();
      if (remaining.startsWith("create") && remaining.includes("function")) {
        inFunction = true;
      }
      if (inFunction && remaining.startsWith("language")) {
        inFunction = false;
      }
    }

    // Statement separator
    if (
      char === ";" &&
      !inSingleQuote &&
      !inDoubleQuote &&
      !inDollarQuote &&
      !inFunction
    ) {
      const statement = current.trim();
      if (statement && statement !== ";") {
        statements.push(statement);
      }
      current = "";
    }
  }

  // Add final statement if exists
  const finalStatement = current.trim();
  if (finalStatement && finalStatement !== ";") {
    statements.push(finalStatement);
  }

  return statements.filter((stmt) => stmt.length > 0);
}

/**
 * Initialize database with core tables
 */
async function initializeDatabase() {
  const client = getDbClient();

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Read the main database schema
    const schemaPath = join(CONFIG.migrationsDir, "001_initial_schema.sql");
    if (!existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schema = readFileSync(schemaPath, "utf8");
    const statements = splitSQLStatements(schema);

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await client.query(statement);
        console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
      } catch (error) {
        console.error(`❌ Statement ${i + 1} failed:`, error.message);
        console.error("Statement:", statement.substring(0, 100) + "...");
        throw error;
      }
    }

    console.log("🎉 Database initialized successfully!");
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Run database migrations
 */
async function runMigrations() {
  const client = getDbClient();

  try {
    await client.connect();
    console.log("✅ Connected for migrations");

    // Check if migration table exists and has correct schema
    const tableCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${CONFIG.migrationTable}'
    `);

    const columns = tableCheck.rows.map((row) => row.column_name);
    const hasOldSchema =
      columns.includes("version") && !columns.includes("migration_name");

    if (hasOldSchema) {
      console.log("🔧 Detected old migration table schema, fixing...");
      // Drop old table and recreate with correct schema
      await client.query(`DROP TABLE IF EXISTS ${CONFIG.migrationTable}`);
      console.log("✅ Old migration table removed");
    }

    // Ensure migration table exists with correct schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${CONFIG.migrationTable} (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT true,
        checksum VARCHAR(64),
        version INTEGER,
        execution_time INTEGER,
        error_message TEXT
      )
    `);

    // Get executed migrations
    const executedResult = await client.query(
      `SELECT migration_name FROM ${CONFIG.migrationTable} ORDER BY executed_at`,
    );
    const executedMigrations = new Set(
      executedResult.rows.map((row) => row.migration_name),
    );

    // Find migration files
    if (!existsSync(CONFIG.migrationsDir)) {
      console.log("📁 No migrations directory found");
      return;
    }

    const migrationFiles = readdirSync(CONFIG.migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let executedCount = 0;

    for (const file of migrationFiles) {
      if (executedMigrations.has(file)) {
        console.log(`⏭️  Skipping ${file} (already executed)`);
        continue;
      }

      console.log(`🔄 Running migration: ${file}`);
      const startTime = Date.now();

      const migrationPath = join(CONFIG.migrationsDir, file);
      const migration = readFileSync(migrationPath, "utf8");
      const checksum = crypto
        .createHash("sha256")
        .update(migration)
        .digest("hex");

      const statements = splitSQLStatements(migration);

      // Execute migration in transaction
      await client.query("BEGIN");

      try {
        for (const statement of statements) {
          await client.query(statement);
        }

        // Record migration
        const executionTime = Date.now() - startTime;
        await client.query(
          `INSERT INTO ${CONFIG.migrationTable} (migration_name, checksum, execution_time, success) VALUES ($1, $2, $3, $4) ON CONFLICT (migration_name) DO NOTHING`,
          [file, checksum, executionTime, true],
        );

        await client.query("COMMIT");
        console.log(`✅ Migration ${file} completed (${executionTime}ms)`);
        executedCount++;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`❌ Migration ${file} failed:`, error.message);
        throw error;
      }
    }

    if (executedCount === 0) {
      console.log("✅ All migrations already executed");
    } else {
      console.log(`🎉 Executed ${executedCount} migrations successfully!`);
    }
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Show migration status
 */
async function migrationStatus() {
  const client = getDbClient();

  try {
    await client.connect();

    // Check if migration table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '${CONFIG.migrationTable}'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log(
        "📋 Migration table doesn't exist. Run 'init' or 'migrate' first.",
      );
      return;
    }

    // Get migration status
    const result = await client.query(
      `SELECT migration_name, executed_at FROM ${CONFIG.migrationTable} ORDER BY executed_at`,
    );

    console.log("\n📋 Migration Status:");
    console.log("==================");

    if (result.rows.length === 0) {
      console.log("No migrations executed yet.");
    } else {
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.migration_name}`);
        console.log(`   Executed: ${row.executed_at.toISOString()}`);
      });
    }

    // Check for pending migrations
    if (existsSync(CONFIG.migrationsDir)) {
      const allFiles = readdirSync(CONFIG.migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      const executedFiles = new Set(
        result.rows.map((row) => row.migration_name),
      );
      const pendingFiles = allFiles.filter((file) => !executedFiles.has(file));

      if (pendingFiles.length > 0) {
        console.log("\n⏳ Pending Migrations:");
        pendingFiles.forEach((file, index) => {
          console.log(`${index + 1}. ${file}`);
        });
      } else {
        console.log("\n✅ All migrations are up to date!");
      }
    }
  } catch (error) {
    console.error("❌ Failed to get migration status:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Warm up the games cache
 */
async function warmCache() {
  console.log("🔥 Warming up games cache...");

  try {
    // Dynamic import to avoid circular dependencies
    const { warmUpCache } = await import("../../src/lib/gameCache.js");
    await warmUpCache();
    console.log("✅ Cache warmed successfully!");
  } catch (error) {
    console.error("❌ Cache warming failed:", error.message);
  }
}

/**
 * Show cache statistics
 */
async function cacheStats() {
  const client = getDbClient();

  try {
    await client.connect();

    const result = await client.query(`
      SELECT 
        COUNT(*) as total_games,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 day') as updated_today,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '7 days') as updated_week
      FROM ggr_games_cache
    `);

    const stats = result.rows[0];

    console.log("\n📊 Cache Statistics:");
    console.log("==================");
    console.log(`Total cached games: ${stats.total_games}`);
    console.log(`Updated today: ${stats.updated_today}`);
    console.log(`Updated this week: ${stats.updated_week}`);
  } catch (error) {
    console.error("❌ Failed to get cache stats:", error.message);
  } finally {
    await client.end();
  }
}

/**
 * Sync data to Typesense
 */
async function syncTypesense() {
  console.log("🔍 Syncing to Typesense...");

  try {
    // Dynamic import to avoid circular dependencies
    const { syncToTypesense } = await import(
      "../../src/lib/typesense.server.js"
    );
    await syncToTypesense();
    console.log("✅ Typesense sync completed!");
  } catch (error) {
    console.error("❌ Typesense sync failed:", error.message);
  }
}

/**
 * Fix migration table issues
 */
async function fixMigrationTable() {
  const client = getDbClient();

  try {
    await client.connect();
    console.log("🔧 Fixing migration table...");

    // Recreate migration table with proper structure (consistent with runMigrations)
    await client.query(`DROP TABLE IF EXISTS ${CONFIG.migrationTable}`);
    await client.query(`
      CREATE TABLE ${CONFIG.migrationTable} (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT true,
        checksum VARCHAR(64),
        version INTEGER,
        execution_time INTEGER,
        error_message TEXT
      )
    `);

    console.log("✅ Migration table fixed!");
  } catch (error) {
    console.error("❌ Failed to fix migration table:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Main function - handle command line arguments
 */
async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case "init":
        await initializeDatabase();
        break;

      case "migrate":
        await runMigrations();
        break;

      case "status":
        await migrationStatus();
        break;

      case "warm":
        await warmCache();
        break;

      case "stats":
        await cacheStats();
        break;

      case "sync":
        await syncTypesense();
        break;

      case "fix":
        await fixMigrationTable();
        break;

      default:
        console.log("\n🛠️  GG Requestz Database Manager");
        console.log("================================");
        console.log("\nUsage: node scripts/database/db-manager.js <command>");
        console.log("\nCommands:");
        console.log("  init     - Initialize database with core tables");
        console.log("  migrate  - Run pending database migrations");
        console.log("  status   - Show migration status");
        console.log("  warm     - Warm up the games cache");
        console.log("  stats    - Show cache statistics");
        console.log("  sync     - Sync data to Typesense");
        console.log("  fix      - Fix migration table issues");
        console.log("\nExamples:");
        console.log("  node scripts/database/db-manager.js init");
        console.log("  node scripts/database/db-manager.js migrate");
        console.log("  node scripts/database/db-manager.js status");
        break;
    }
  } catch (error) {
    console.error("\n❌ Command failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
