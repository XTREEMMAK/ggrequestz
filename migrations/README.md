# Database Migration Strategy

## Overview
This directory contains database migrations for updating existing GGRequestz installations. For fresh Docker installations, use `docker-init.sql` instead.

## Migration Files

### Active Migrations (for updates only)
- `003_hierarchical_navigation_simple.sql` - Adds hierarchical role navigation system

### Deprecated Migrations (superseded by docker-init.sql)
- `001_complete_schema.sql` - **DEPRECATED** - Use docker-init.sql for fresh installs
- `002_additional_features.sql` - **DEPRECATED** - Use docker-init.sql for fresh installs  
- `003_hierarchical_navigation.sql` - **DEPRECATED** - Use 003_simple version instead

## Usage Guidelines

### Fresh Docker Installation
Use `docker-init.sql` which contains the complete, up-to-date schema with all features.

### Existing Installation Updates
Run migrations in numerical order:
1. Check if migration was already applied: `SELECT * FROM ggr_migrations;`
2. Run only needed migrations
3. Always backup before applying migrations

### Docker Container Updates
1. New deployments: Use docker-init.sql (complete schema)
2. Existing containers: Use migration scripts to update incrementally

## Migration Naming Convention
- Format: `XXX_descriptive_name.sql`
- XXX = sequential number (001, 002, 003, etc.)
- Use underscores for multi-word descriptions

## Migration Template
```sql
-- Description Migration
-- Migration: XXX_migration_name
-- Description: Brief description of what this migration does

-- Add your migration logic here
-- Use IF NOT EXISTS for safety
-- Record the migration
INSERT INTO ggr_migrations (migration_name, executed_at, success) 
VALUES ('XXX_migration_name', CURRENT_TIMESTAMP, true)
ON CONFLICT (migration_name) DO NOTHING;
```