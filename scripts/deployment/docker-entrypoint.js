#!/usr/bin/env node

/**
 * Docker entrypoint script for G.G Requestz
 * Handles database migrations and startup
 */

import { spawn } from "child_process";
import { config } from "dotenv";
import { existsSync } from "fs";

// Load environment variables
config();

console.log("🐳 G.G Requestz Docker Entrypoint");
console.log("================================");

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`➤ Running: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ ${command} completed successfully`);
        resolve(code);
      } else {
        console.error(`❌ ${command} failed with code ${code}`);
        reject(new Error(`${command} failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      console.error(`❌ Failed to start ${command}:`, error.message);
      reject(error);
    });
  });
}

async function waitForDatabase() {
  const maxRetries = 30;
  const retryInterval = 2000; // 2 seconds

  console.log("⏳ Waiting for database connection...");

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to run a simple database check
      await runCommand("node", [
        "-e",
        `
        const { Client } = require('pg');
        
        const client = new Client({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'postgres',
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD
        });
        
        client.connect()
          .then(() => client.query('SELECT 1'))
          .then(() => {
            console.log('Database connection successful');
            client.end();
            process.exit(0);
          })
          .catch((err) => {
            console.error('Database connection failed:', err.message);
            client.end();
            process.exit(1);
          });
      `,
      ]);

      console.log("✅ Database connection established");
      return;
    } catch (error) {
      console.log(
        `⏳ Attempt ${i + 1}/${maxRetries} failed, retrying in ${retryInterval / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }

  console.error("❌ Failed to connect to database after maximum retries");
  console.error(
    "   Please check your database configuration and ensure the database server is running",
  );
  process.exit(1);
}

async function runMigrations() {
  const autoMigrate = process.env.AUTO_MIGRATE !== "false";
  const resetDatabase = process.env.RESET_DATABASE === "true";

  if (!autoMigrate) {
    console.log("⏭️  Auto-migration disabled (AUTO_MIGRATE=false)");
    return;
  }

  // Reset database if requested
  if (resetDatabase) {
    console.log("🗑️  Database reset requested (RESET_DATABASE=true)");
    console.log(
      "⚠️  Database reset functionality has been deprecated for safety",
    );
    console.log(
      "   To reset the database, please drop and recreate it manually",
    );
    // Skip reset for safety - in production, manual intervention is preferred
  }

  // Check if database schema exists by testing for ggr_users table
  console.log("🔍 Checking if database schema exists...");
  let schemaExists = false;

  try {
    await runCommand("node", [
      "-e",
      `
      const { Client } = require('pg');
      
      const client = new Client({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'postgres',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD
      });
      
      client.connect()
        .then(() => client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ggr_users')"))
        .then((result) => {
          if (result.rows[0].exists) {
            console.log('Schema exists - will run migrations');
            process.exit(0);
          } else {
            console.log('Schema missing - will initialize database');
            process.exit(1);
          }
        })
        .catch((err) => {
          console.error('Schema check failed:', err.message);
          process.exit(2);
        })
        .finally(() => client.end());
    `,
    ]);

    schemaExists = true;
  } catch (error) {
    // Exit code 1 means schema doesn't exist, exit code 2 means check failed
    if (error.message.includes("code 1")) {
      schemaExists = false;
    } else {
      console.error("❌ Failed to check database schema:", error.message);
      process.exit(1);
    }
  }

  if (!schemaExists) {
    // Fresh install - use db-manager.js
    console.log("🆕 Fresh database detected, initializing schema...");
    try {
      await runCommand("node", ["scripts/database/db-manager.js", "init"]);
      console.log("✅ Database initialization completed successfully");

      // Run migrations after initialization for fresh installs
      console.log("🚀 Running migrations after initialization...");
      await runCommand("node", ["scripts/database/db-manager.js", "migrate"]);
      console.log("✅ Database migrations completed successfully");
      return;
    } catch (error) {
      console.error("❌ Database initialization failed:", error.message);
      console.error("❌ Stopping startup due to initialization failure");
      process.exit(1);
    }
  }

  // Existing database - run migrations
  console.log("📅 Existing database detected, checking for migrations...");

  // Use db-manager.js for migrations
  const migrationScript = "scripts/database/db-manager.js";

  console.log("🔄 Running database migrations...");

  try {
    await runCommand("node", [migrationScript, "migrate"]);
    console.log("✅ Database migrations completed successfully");
  } catch (error) {
    console.error("❌ Database migration failed:", error.message);
    console.error(
      "   The application may still start but database schema might be outdated",
    );

    // Don't start application if migrations fail
    console.error("❌ Stopping startup due to migration failure");
    process.exit(1);
  }
}

async function initializeDatabase() {
  console.log(
    "⏭️  Skipping legacy database initialization (using migrations instead)",
  );
  // Legacy init script disabled - migrations handle all table creation
}

async function warmCaches() {
  console.log("🔥 Warming application caches...");

  // Issue #9: this used to hardcode `http://localhost:3000`, which fails for
  // two reasons. `localhost` resolves to ::1 ahead of 127.0.0.1 inside the
  // container while the Node server binds IPv4 only, and the port is not
  // always 3000. Address the loopback interface explicitly.
  //
  // Deliberately NOT using PUBLIC_SITE_URL: that would route the warm-up out
  // through DNS, TLS and the reverse proxy and back, which is the hairpin this
  // release exists to remove.
  const port = process.env.PORT || "3000";
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await runCommand("node", [
      "-e",
      `
      const baseUrl = ${JSON.stringify(baseUrl)};

      async function warmUp() {
        try {
          console.log('📦 Pre-warming caches for faster initial load...');

          for (const path of ['/api/games/popular?page=1&limit=8', '/api/games/recent?page=1&limit=8']) {
            try {
              const resp = await fetch(baseUrl + path, { signal: AbortSignal.timeout(15000) });
              if (resp.ok) {
                console.log('✅ Warmed ' + path);
              } else {
                console.log('⚠️ Warm-up got HTTP ' + resp.status + ' for ' + path);
              }
            } catch (error) {
              console.log('⚠️ Warm-up request failed for ' + path + ': ' + error.message);
            }
          }

          console.log('🔥 Cache warming complete');
        } catch (error) {
          console.log('⚠️ Cache warming failed (non-critical):', error.message);
        }
      }

      // Wait for app to be ready then warm caches
      setTimeout(warmUp, 5000);
      `,
    ]);
  } catch (error) {
    console.log("⚠️ Cache warming failed (non-critical):", error.message);
  }
}

async function startApplication() {
  console.log("🚀 Starting G.G Requestz application...");
  console.log("================================");

  // Start PM2 with ecosystem config
  const pm2Args = ["start", "ecosystem.config.cjs"];

  // If in development mode, use watch mode
  if (process.env.NODE_ENV === "development") {
    pm2Args.push("--watch");
  }

  try {
    // Start the application first
    const appProcess = spawn("pm2-runtime", pm2Args, {
      stdio: "inherit",
      env: process.env,
    });

    // Warm caches after a delay (non-blocking)
    if (process.env.NODE_ENV === "production") {
      setTimeout(() => {
        warmCaches().catch(console.error);
      }, 10000); // Wait 10 seconds for app to fully start
    }

    // Handle process events
    appProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`❌ Application exited with code ${code}`);
        process.exit(code);
      }
    });

    appProcess.on("error", (error) => {
      console.error("❌ Failed to start application:", error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start application:", error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    // Wait for database to be available
    await waitForDatabase();

    // Initialize database tables if needed
    await initializeDatabase();

    // Run migrations
    await runMigrations();

    // Start the application
    await startApplication();
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
