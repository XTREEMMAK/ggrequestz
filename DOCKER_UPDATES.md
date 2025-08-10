# Docker Database Update Strategy

## Overview
This document outlines the strategy for managing database changes in Docker deployments of GGRequestz.

## File Structure
```
/
├── docker-init.sql                 # Complete schema for fresh installations
├── migrations/                     # Update-only migrations
│   ├── 003_hierarchical_navigation_simple.sql
│   ├── deprecated/                 # Archived migrations
│   └── README.md
├── scripts/
│   └── migrate.sh                  # Migration management script
└── DOCKER_UPDATES.md              # This file
```

## Update Scenarios

### 1. Fresh Docker Installation
**Use Case**: New deployment, empty database

**Process**:
```bash
# Docker initialization automatically runs docker-init.sql
# This creates the complete, up-to-date schema
# No manual migration needed
```

**Files Used**: `docker-init.sql`

### 2. Docker Container Update (Existing Data)
**Use Case**: Updating existing Docker deployment with data

**Process**:
```bash
# 1. Backup existing data
docker exec container_name pg_dump -U postgres postgres > backup.sql

# 2. Run migration script
docker exec container_name ./scripts/migrate.sh apply-all

# 3. Verify migrations
docker exec container_name ./scripts/migrate.sh status
```

**Files Used**: Migration files in `/migrations/`

### 3. Development Database Updates
**Use Case**: Local development environment updates

**Process**:
```bash
# Load environment variables
source .env

# Apply specific migration
./scripts/migrate.sh apply migrations/003_hierarchical_navigation_simple.sql

# Or apply all pending migrations
./scripts/migrate.sh apply-all
```

## Migration File Guidelines

### For Updates Only
- Place in `/migrations/` directory
- Use sequential numbering: `001_`, `002_`, etc.
- Include rollback information in comments
- Always use `IF NOT EXISTS` and `ON CONFLICT` for safety
- Record migration in `ggr_migrations` table

### Migration Template
```sql
-- Feature Description Migration
-- Migration: XXX_feature_name
-- Description: What this migration adds/changes
-- Rollback: How to undo this migration (if possible)

-- Migration logic here...
ALTER TABLE example ADD COLUMN IF NOT EXISTS new_field VARCHAR(100);

-- Record migration completion
INSERT INTO ggr_migrations (migration_name, executed_at, success) 
VALUES ('XXX_feature_name', CURRENT_TIMESTAMP, true)
ON CONFLICT (migration_name) DO NOTHING;
```

## Docker Compose Integration

### Environment Variables
```yaml
environment:
  - POSTGRES_HOST=database
  - POSTGRES_PORT=5432
  - POSTGRES_DB=postgres
  - POSTGRES_USER=postgres
  - POSTGRES_PASSWORD=your_secure_password
```

### Volume Mounts
```yaml
volumes:
  - ./docker-init.sql:/docker-entrypoint-initdb.d/docker-init.sql
  - ./migrations:/app/migrations
  - ./scripts:/app/scripts
```

## Best Practices

### 1. Always Backup Before Updates
```bash
# Create backup before applying migrations
pg_dump -h host -U user -d database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Test Migrations First
- Test on development environment first
- Verify data integrity after migration
- Check application functionality

### 3. Rollback Strategy
- Document rollback steps in migration comments
- Keep backups for quick restore if needed
- Test rollback procedures in development

### 4. Migration Safety
- Use transactions when possible
- Include safety checks (`IF NOT EXISTS`, `ON CONFLICT`)
- Add proper indexes for performance
- Validate data after structural changes

## Troubleshooting

### Common Issues

#### Permission Errors
```sql
-- If you get permission errors, you may need superuser access
-- Contact your database administrator
```

#### Migration Already Applied
```bash
# Check migration status
./scripts/migrate.sh status

# Manually mark migration as complete if needed
# (Only if you're certain it was applied correctly)
```

#### Failed Migration
```bash
# Check detailed error logs
docker logs container_name

# Restore from backup if necessary
psql -h host -U user -d database < backup.sql
```

## Security Notes

- Never commit passwords or sensitive data to version control
- Use environment variables for database credentials
- Regularly update and rotate database passwords
- Monitor migration logs for security issues
- Backup before any major schema changes

## Support

For issues with database migrations:
1. Check the migration logs
2. Verify environment variables are correct
3. Ensure database connectivity
4. Review the specific migration file for errors
5. Restore from backup if necessary