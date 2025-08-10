#!/usr/bin/env node

/**
 * Docker entrypoint script for G.G Requestz
 * Handles database migrations and startup
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';
import { existsSync } from 'fs';

// Load environment variables
config();

console.log('🐳 G.G Requestz Docker Entrypoint');
console.log('================================');

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`➤ Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { 
      stdio: 'inherit',
      env: process.env 
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${command} completed successfully`);
        resolve(code);
      } else {
        console.error(`❌ ${command} failed with code ${code}`);
        reject(new Error(`${command} failed with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ Failed to start ${command}:`, error.message);
      reject(error);
    });
  });
}

async function waitForDatabase() {
  const maxRetries = 30;
  const retryInterval = 2000; // 2 seconds
  
  console.log('⏳ Waiting for database connection...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to run a simple database check
      await runCommand('node', ['-e', `
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
      `]);
      
      console.log('✅ Database connection established');
      return;
    } catch (error) {
      console.log(`⏳ Attempt ${i + 1}/${maxRetries} failed, retrying in ${retryInterval/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  
  console.error('❌ Failed to connect to database after maximum retries');
  console.error('   Please check your database configuration and ensure the database server is running');
  process.exit(1);
}

async function runMigrations() {
  const autoMigrate = process.env.AUTO_MIGRATE !== 'false';
  const resetDatabase = process.env.RESET_DATABASE === 'true';
  
  if (!autoMigrate) {
    console.log('⏭️  Auto-migration disabled (AUTO_MIGRATE=false)');
    return;
  }
  
  // Reset database if requested
  if (resetDatabase) {
    console.log('🗑️  Database reset requested (RESET_DATABASE=true)');
    try {
      await runCommand('node', ['scripts/reset-database.js', 'reset']);
      console.log('✅ Database reset completed');
    } catch (error) {
      console.error('❌ Database reset failed:', error.message);
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
    }
  }
  
  // Check if new migration manager exists, fallback to old script
  const migrationScript = existsSync('./scripts/migration-manager.js') 
    ? 'scripts/migration-manager.js'
    : existsSync('./scripts/run-migrations.js') 
      ? 'scripts/run-migrations.js'
      : null;
  
  if (!migrationScript) {
    console.log('⏭️  Migration script not found, skipping migrations');
    return;
  }
  
  console.log('🔄 Running database migrations...');
  
  try {
    if (migrationScript.includes('migration-manager.js')) {
      // Use new migration manager
      await runCommand('node', [migrationScript, 'migrate']);
    } else {
      // Use legacy migration script
      await runCommand('node', [migrationScript]);
    }
    
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    console.error('   The application may still start but database schema might be outdated');
    
    // Don't start application if migrations fail
    console.error('❌ Stopping startup due to migration failure');
    process.exit(1);
  }
}

async function initializeDatabase() {
  console.log('⏭️  Skipping legacy database initialization (using migrations instead)');
  // Legacy init script disabled - migrations handle all table creation
}

async function startApplication() {
  console.log('🚀 Starting G.G Requestz application...');
  console.log('================================');
  
  // Start PM2 with ecosystem config
  const pm2Args = ['start', 'ecosystem.config.cjs'];
  
  // If in development mode, use watch mode
  if (process.env.NODE_ENV === 'development') {
    pm2Args.push('--watch');
  }
  
  try {
    await runCommand('pm2-runtime', pm2Args);
  } catch (error) {
    console.error('❌ Failed to start application:', error.message);
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
    console.error('❌ Startup failed:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});