#!/usr/bin/env node

/**
 * Alternative PostgreSQL setup script for direct database connections
 * Use this if you have direct PostgreSQL access instead of Supabase cloud
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import pkg from "pg";
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - use .env.development in development mode (Vite convention)
const configPath =
  process.env.NODE_ENV === "development" ? ".env.development" : ".env";
config({ path: configPath });

async function setupPostgreSQL() {
  console.log("🐘 Setting up PostgreSQL database for GG Requestz...");

  const dbConfig = {
    host:
      process.env.POSTGRES_HOST ||
      process.env.SUPABASE_URL?.split(":")[0] ||
      "localhost",
    port:
      process.env.POSTGRES_PORT ||
      process.env.SUPABASE_URL?.split(":")[1] ||
      5432,
    database: process.env.POSTGRES_DB || "ggrequestz",
    user: process.env.POSTGRES_USER || "postgres",
    password:
      process.env.POSTGRES_PASSWORD || process.env.SUPABASE_SERVICE_KEY || "",
  };

  console.log(
    `📡 Connecting to PostgreSQL at ${dbConfig.host}:${dbConfig.port}...`,
  );

  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log("✅ Connected to PostgreSQL successfully");

    // Read the migration file
    const migrationPath = join(
      __dirname,
      "../migrations/001_create_ggr_tables.sql",
    );
    const migrationSQL = readFileSync(migrationPath, "utf8");

    console.log("📄 Executing database migration...");

    // Split SQL into statements, handling multi-line statements properly
    const statements = [];
    let currentStatement = "";
    let inDollarQuote = false;
    let dollarTag = "";

    const lines = migrationSQL.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith("--")) {
        continue;
      }

      // Check for dollar-quoted strings (like in functions)
      const dollarMatches = trimmedLine.match(/\$([^$]*)\$/g);
      if (dollarMatches) {
        for (const match of dollarMatches) {
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarTag = match;
          } else if (match === dollarTag) {
            inDollarQuote = false;
            dollarTag = "";
          }
        }
      }

      currentStatement += line + "\n";

      // If we're not in a dollar-quoted string and the line ends with semicolon
      if (!inDollarQuote && trimmedLine.endsWith(";")) {
        const stmt = currentStatement.trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
        currentStatement = "";
      }
    }

    // Add any remaining statement
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim());
    }

    let successCount = 0;

    for (const statement of statements) {
      if (statement.trim().length === 0) continue;

      try {
        console.log(`Executing: ${statement.substring(0, 60)}...`);
        await client.query(statement);
        successCount++;
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`✅ Already exists: ${statement.substring(0, 50)}...`);
          successCount++;
        } else {
          console.error(`❌ Error: ${error.message}`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(`✅ Migration completed: ${successCount} statements processed`);

    // Verify tables were created
    console.log("🔍 Verifying table creation...");

    const tables = [
      "ggr_games_cache",
      "ggr_game_requests",
      "ggr_user_watchlist",
      "ggr_user_analytics",
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

    console.log("🎉 PostgreSQL setup completed!");
    console.log("\n📋 Next steps:");
    console.log(
      "1. Update your .env file with correct database connection details",
    );
    console.log("2. Run the application: npm run dev");
    console.log(
      "3. The cache will populate automatically as users browse games",
    );
  } catch (error) {
    console.error("❌ PostgreSQL setup failed:", error.message);

    console.log("\n💡 Connection troubleshooting:");
    console.log("- Check that PostgreSQL is running");
    console.log("- Verify connection details in .env file");
    console.log("- Make sure the database exists");
    console.log("- Check user permissions");
    console.log("\nConnection attempted with:");
    console.log(`  Host: ${dbConfig.host}`);
    console.log(`  Port: ${dbConfig.port}`);
    console.log(`  Database: ${dbConfig.database}`);
    console.log(`  User: ${dbConfig.user}`);

    process.exit(1);
  } finally {
    await client.end();
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case "setup":
  case "init":
    setupPostgreSQL();
    break;
  default:
    console.log("PostgreSQL Database Setup for GG Requestz\n");
    console.log("Usage:");
    console.log(
      "  node scripts/setup-postgres.js setup  - Setup PostgreSQL database",
    );
    console.log("\nEnvironment variables needed:");
    console.log(
      "  POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD",
    );
    console.log("  OR use existing SUPABASE_URL and SUPABASE_SERVICE_KEY");
    break;
}
