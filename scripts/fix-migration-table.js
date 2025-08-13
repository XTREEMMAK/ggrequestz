#!/usr/bin/env node

/**
 * Fix Migration Table Structure
 * Adds missing checksum column to existing migration table for production deployment
 */

import { config } from 'dotenv';
import pkg from 'pg';
import crypto from 'crypto';
const { Client } = pkg;

// Load environment variables
config();

const MIGRATION_CONFIG = {
  migrationTable: 'ggr_migrations',
  versionTable: 'ggr_schema_version',
  lockTable: 'ggr_migration_lock'
};

class MigrationTableFixer {
  constructor() {
    this.client = this.getDbClient();
  }

  getDbClient() {
    return new Client({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'postgres',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    });
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async disconnect() {
    await this.client.end();
  }

  async checkColumnExists(tableName, columnName) {
    const result = await this.client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    
    return result.rows.length > 0;
  }

  async checkTableExists(tableName) {
    const result = await this.client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    return result.rows.length > 0;
  }

  async fixMigrationTable() {
    console.log('🔍 Checking migration table structure...');
    
    // Check if migration table exists
    const tableExists = await this.checkTableExists(MIGRATION_CONFIG.migrationTable);
    
    if (!tableExists) {
      console.log('📋 Migration table does not exist - will be created by migration manager');
      return;
    }

    console.log('✅ Migration table exists');

    // Check for required columns and add them if missing
    const requiredColumns = [
      { name: 'version', type: 'INTEGER' },
      { name: 'execution_time', type: 'INTEGER' },
      { name: 'error_message', type: 'TEXT' },
      { name: 'checksum', type: 'VARCHAR(64)' }
    ];

    let columnsAdded = false;

    for (const column of requiredColumns) {
      const exists = await this.checkColumnExists(MIGRATION_CONFIG.migrationTable, column.name);
      
      if (!exists) {
        console.log(`⚠️  Column '${column.name}' missing - adding it now...`);
        
        try {
          await this.client.query(`
            ALTER TABLE ${MIGRATION_CONFIG.migrationTable} 
            ADD COLUMN ${column.name} ${column.type}
          `);
          
          console.log(`✅ Added ${column.name} column to migration table`);
          columnsAdded = true;
        } catch (error) {
          console.error(`❌ Failed to add ${column.name} column:`, error.message);
          throw error;
        }
      } else {
        console.log(`✅ Column '${column.name}' already exists`);
      }
    }

    // Set default values for existing records if we added columns
    if (columnsAdded) {
      console.log('📝 Setting default values for existing records...');
      
      const existingRecords = await this.client.query(`
        SELECT id, migration_name FROM ${MIGRATION_CONFIG.migrationTable} 
        WHERE version IS NULL OR checksum IS NULL
      `);

      if (existingRecords.rows.length > 0) {
        for (const record of existingRecords.rows) {
          // Generate a placeholder checksum based on migration name
          const placeholderChecksum = crypto
            .createHash('sha256')
            .update(`legacy_migration_${record.migration_name}`)
            .digest('hex');
          
          await this.client.query(`
            UPDATE ${MIGRATION_CONFIG.migrationTable} 
            SET version = COALESCE(version, 0),
                execution_time = COALESCE(execution_time, 0),
                checksum = COALESCE(checksum, $1)
            WHERE id = $2
          `, [placeholderChecksum, record.id]);
        }
        
        console.log('✅ Updated existing records with default values');
      }
    }
  }

  async ensureAllTables() {
    console.log('🔍 Ensuring all migration tables exist with correct structure...');
    
    // Create migration tracking table if it doesn't exist
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

    // Create schema version table if it doesn't exist
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_CONFIG.versionTable} (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        rollback_sql TEXT -- SQL to rollback this version
      )
    `);

    // Create migration lock table if it doesn't exist
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

    console.log('✅ All migration tables are properly configured');
  }

  async validateTableStructure() {
    console.log('🔍 Validating migration table structure...');
    
    const columns = await this.client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `, [MIGRATION_CONFIG.migrationTable]);

    console.log('📋 Current migration table structure:');
    for (const col of columns.rows) {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    }

    // Check for required columns
    const requiredColumns = ['id', 'migration_name', 'version', 'executed_at', 'checksum'];
    const existingColumns = columns.rows.map(col => col.column_name);
    
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.error(`❌ Missing required columns: ${missingColumns.join(', ')}`);
      return false;
    }

    console.log('✅ Migration table structure is valid');
    return true;
  }
}

async function main() {
  const fixer = new MigrationTableFixer();

  try {
    console.log('🔧 G.G Requestz Migration Table Fixer');
    console.log('=====================================');
    
    await fixer.connect();
    await fixer.fixMigrationTable();
    await fixer.ensureAllTables();
    
    const isValid = await fixer.validateTableStructure();
    
    if (isValid) {
      console.log('\n🎉 Migration table structure fixed successfully!');
      console.log('✅ Production deployment should now work');
    } else {
      console.log('\n❌ Migration table structure is still invalid');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Failed to fix migration table:', error.message);
    process.exit(1);
  } finally {
    await fixer.disconnect();
  }
}

main();