#!/usr/bin/env node

/**
 * Run all database migrations for GG Requestz
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

// Create PostgreSQL client
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

/**
 * Split SQL statements intelligently, handling PostgreSQL functions with dollar-quoted strings
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = "";
  let inDollarQuote = false;
  let dollarQuoteTag = "";
  let inFunction = false;

  const lines = sql.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip comments and empty lines
    if (trimmedLine.length === 0 || trimmedLine.startsWith("--")) {
      continue;
    }

    // Check for start of function
    if (
      trimmedLine.includes("CREATE OR REPLACE FUNCTION") ||
      trimmedLine.includes("CREATE FUNCTION")
    ) {
      inFunction = true;
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
      // If we're in a function and it ends with ';', check if it's the end
      if (inFunction) {
        // Look for language declaration which typically ends functions
        if (
          trimmedLine.includes("language") ||
          trimmedLine.includes("LANGUAGE")
        ) {
          inFunction = false;
        }
      }

      // If not in function or dollar quote, this is end of statement
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

  return statements;
}

async function runMigrations() {
  console.log("🚀 Running all database migrations...");

  const client = getDbClient();

  try {
    await client.connect();
    console.log("✅ Connected to PostgreSQL database");

    // List all migrations in order
    const migrations = [
      "001_create_ggr_tables.sql",
      "002_create_users_table.sql",
      "003_add_roles_permissions.sql",
      "004_platform_links.sql",
      "005_custom_navigation.sql",
      "006_fix_permissions_view.sql",
    ];

    let allStatements = [];

    for (const migrationFile of migrations) {
      const migrationPath = join(__dirname, "..", "migrations", migrationFile);
      try {
        const migrationSQL = readFileSync(migrationPath, "utf8");
        console.log(`📄 Reading migration: ${migrationFile}`);

        const statements = splitSQLStatements(migrationSQL);
        allStatements.push(...statements);
      } catch (err) {
        console.log(`⚠️  Migration file not found: ${migrationFile}`);
      }
    }

    let successCount = 0;
    let skippedCount = 0;

    for (const statement of allStatements) {
      if (statement.trim().length === 0) continue;

      console.log(`Executing: ${statement.substring(0, 60)}...`);

      try {
        await client.query(statement);
        successCount++;
      } catch (err) {
        if (
          err.message?.includes("already exists") ||
          err.message?.includes("duplicate key") ||
          err.message?.includes("does not exist")
        ) {
          console.log(
            `✅ Already exists/handled: ${statement.substring(0, 50)}...`,
          );
          skippedCount++;
        } else {
          console.error(`❌ Error executing statement: ${err.message}`);
          console.error(`Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }

    console.log(
      `✅ Migration completed: ${successCount} statements executed, ${skippedCount} skipped`,
    );

    // Test the permissions view
    console.log("🔍 Testing permissions view...");
    try {
      const viewTest = await client.query(
        "SELECT COUNT(*) FROM ggr_user_permissions",
      );
      console.log(
        `✅ ggr_user_permissions view working: ${viewTest.rows[0].count} permissions found`,
      );
    } catch (err) {
      console.error(`❌ Error testing permissions view: ${err.message}`);
    }

    // Show user info if any exist
    try {
      const users = await client.query(
        "SELECT id, email FROM ggr_users LIMIT 3",
      );
      if (users.rows.length > 0) {
        console.log("👥 Users found:");
        for (const user of users.rows) {
          console.log(`  - ID: ${user.id}, Email: ${user.email}`);

          // Check permissions for this user
          const perms = await client.query(
            "SELECT permission_name FROM ggr_user_permissions WHERE user_id = $1",
            [user.id],
          );
          console.log(
            `    Permissions: ${perms.rows.map((p) => p.permission_name).join(", ") || "None"}`,
          );
        }
      }
    } catch (err) {
      console.log("No users found or error checking users:", err.message);
    }

    console.log("🎉 All migrations completed!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
