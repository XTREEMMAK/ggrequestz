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
import { splitSQLStatements } from "./sql-statements.js";
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read from package.json rather than a second hand-maintained constant, which
// had drifted to 1.1.3 and made log output misleading about what was running.
const DB_MANAGER_VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
).version;

// Load environment variables - use .env.development in development mode (Vite convention)
const configPath =
  process.env.NODE_ENV === "development" ? ".env.development" : ".env";
config({ path: configPath });

console.log("🗄️  G.G Requestz Database Manager v" + DB_MANAGER_VERSION);
console.log("==================================");

// Configuration
//
// Migrations are tracked by filename presence in ggr_migrations, ordered
// lexicographically. There is no version-delta upgrade path: the
// ggr_schema_version and ggr_migration_lock tables are created by
// 001_initial_schema.sql but nothing reads them, and the rollback_sql column is
// stored and never executed. A `versionTable` key used to sit here pointing at
// ggr_schema_version; it was never referenced, so it has been removed rather
// than left implying a mechanism that does not exist.
const CONFIG = {
  migrationsDir: join(__dirname, "..", "..", "migrations"),
  migrationTable: "ggr_migrations",
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

    // Check if core tables exist to determine if DB is already initialized
    const coreTablesCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('ggr_users', 'ggr_games_cache', 'ggr_game_requests')
    `);
    const coreTablesExist = parseInt(coreTablesCheck.rows[0].count) > 0;

    // Check if migration table exists and has correct schema
    const tableCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${CONFIG.migrationTable}'
    `);

    const columns = tableCheck.rows.map((row) => row.column_name);

    // Expected columns in the correct schema
    const requiredColumns = [
      "id",
      "migration_name",
      "executed_at",
      "success",
      "checksum",
    ];
    const hasCorrectSchema = requiredColumns.every((col) =>
      columns.includes(col),
    );

    // Check for various broken schema states:
    // 1. Old schema with 'version' but no 'migration_name'
    // 2. Missing required columns like 'executed_at'
    // 3. Has wrong column names (e.g., 'applied_at' instead of 'executed_at')
    const hasOldOrBrokenSchema = !hasCorrectSchema;

    if (hasOldOrBrokenSchema && columns.length > 0) {
      console.log("🔧 Detected incorrect migration table schema, fixing...");
      console.log(`   Current columns: ${columns.join(", ")}`);
      console.log(`   Expected columns: ${requiredColumns.join(", ")}`);

      // Drop old table and recreate with correct schema
      await client.query(
        `DROP TABLE IF EXISTS ${CONFIG.migrationTable} CASCADE`,
      );
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

    // If core tables exist but migration table was just created/fixed,
    // mark initial schema as already executed
    if (coreTablesExist) {
      const migrationCount = await client.query(
        `SELECT COUNT(*) as count FROM ${CONFIG.migrationTable}`,
      );

      if (parseInt(migrationCount.rows[0].count) === 0) {
        console.log(
          "📝 Database already initialized, marking initial schema as complete...",
        );
        await client.query(
          `INSERT INTO ${CONFIG.migrationTable}
           (migration_name, success, executed_at)
           VALUES ('001_initial_schema.sql', true, NOW())
           ON CONFLICT (migration_name) DO NOTHING`,
        );
      }
    }

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

    // Verify critical columns exist after migrations
    await verifySchemaIntegrity(client);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Verify that database schema matches what migrations should have created
 */
async function verifySchemaIntegrity(client) {
  console.log("🔍 Verifying database schema integrity...");

  try {
    // Get list of executed migrations
    const executedMigrations = await client.query(
      `SELECT migration_name, executed_at FROM ${CONFIG.migrationTable} ORDER BY migration_name`,
    );

    // Dynamically check for columns based on migration files that should have run
    const migrationFiles = existsSync(CONFIG.migrationsDir)
      ? readdirSync(CONFIG.migrationsDir)
          .filter((file) => file.endsWith(".sql"))
          .sort()
      : [];

    let schemaIssues = [];

    // For each migration file, check if it was executed
    for (const migrationFile of migrationFiles) {
      const wasExecuted = executedMigrations.rows.some(
        (row) => row.migration_name === migrationFile,
      );

      if (!wasExecuted) {
        console.log(`⚠️  Migration ${migrationFile} has not been executed yet`);

        // Read the migration to understand what it should create
        try {
          const migrationPath = join(CONFIG.migrationsDir, migrationFile);
          const migrationContent = readFileSync(migrationPath, "utf8");

          // Extract ADD COLUMN statements to know what columns should exist
          const addColumnRegex =
            /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(\w+)/gi;
          let match;
          while ((match = addColumnRegex.exec(migrationContent)) !== null) {
            const columnName = match[1];
            console.log(`   - This migration should add column: ${columnName}`);
          }
        } catch (err) {
          console.warn(`   Could not analyze migration file: ${err.message}`);
        }
      } else {
        console.log(`✅ Migration ${migrationFile} was executed`);
      }
    }

    // Check for specific known issues that cause problems
    const knownProblematicColumns = [
      {
        table: "ggr_games_cache",
        columns: ["content_rating", "esrb_rating", "is_mature", "is_nsfw"],
        description: "ESRB rating columns needed for content filtering",
      },
    ];

    for (const { table, columns, description } of knownProblematicColumns) {
      const columnCheck = await client.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1
        AND column_name = ANY($2::text[])
      `,
        [table, columns],
      );

      const foundColumns = columnCheck.rows.map((row) => row.column_name);
      const missingColumns = columns.filter(
        (col) => !foundColumns.includes(col),
      );

      if (missingColumns.length > 0) {
        schemaIssues.push({
          table,
          missingColumns,
          description,
          severity: "error",
        });
        console.log(
          `❌ Missing columns in ${table}: ${missingColumns.join(", ")}`,
        );
        console.log(`   ${description}`);
      }
    }

    // Check for problematic foreign key constraints
    const foreignKeyCheck = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'ggr_game_requests'
        AND kcu.column_name = 'igdb_id'
    `);

    if (foreignKeyCheck.rows.length > 0) {
      schemaIssues.push({
        type: "foreign_key",
        constraints: foreignKeyCheck.rows,
        description:
          "Foreign key constraints that prevent creating requests for non-cached games",
        severity: "warning",
      });
      console.log(
        `⚠️  Found ${foreignKeyCheck.rows.length} foreign key constraint(s) on ggr_game_requests.igdb_id`,
      );
      console.log(
        "   These may prevent creating requests for games not yet in cache",
      );
    }

    // Report results
    if (schemaIssues.length > 0) {
      const errors = schemaIssues.filter((issue) => issue.severity === "error");
      const warnings = schemaIssues.filter(
        (issue) => issue.severity === "warning",
      );

      if (errors.length > 0) {
        // Deliberately does not throw. A self-hosted instance that refuses to
        // boot on a schema mismatch is worse than one that boots degraded: the
        // operator loses the admin UI they would use to fix it. The trade-off
        // is that this MUST be loud, and on stderr — a schema error on stdout
        // is indistinguishable from normal startup chatter in container logs.
        console.error(
          `\n❌ Schema verification found ${errors.length} error(s). ` +
            `The application will start, but affected features will fail.`,
        );
        for (const issue of errors) {
          const missing = issue.missingColumns?.length
            ? ` (missing: ${issue.missingColumns.join(", ")})`
            : "";
          console.error(
            `   - ${issue.table || issue.type}: ${issue.description}${missing}`,
          );
        }
        console.error(
          "   Fix with: node scripts/database/db-manager.js migrate",
        );
      }

      if (warnings.length > 0) {
        console.log(
          `\n⚠️  Schema verification found ${warnings.length} warning(s)`,
        );
        console.log("   Some features may be limited");
      }
    } else {
      console.log("✅ Database schema integrity verified successfully");
    }

    return schemaIssues;
  } catch (error) {
    console.error("❌ Schema verification error:", error.message);
    // Don't throw - allow app to start
    return [
      { type: "verification_error", error: error.message, severity: "warning" },
    ];
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
