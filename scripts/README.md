# 🛠️ GG Requestz Scripts

This directory contains utility scripts for database management, deployment, and maintenance operations.

## 📂 Directory Structure

```
scripts/
├── README.md              # This index file
├── database/              # Database and migration scripts
│   ├── db-manager.js           # Unified database management (replaces 4 scripts)
│   └── setup-postgres.js       # Direct PostgreSQL setup
├── deployment/            # Deployment and Docker scripts
│   ├── docker-entrypoint.js    # Docker container entry point
│   ├── docker-cleanup.sh       # Docker cleanup utilities
│   ├── docker-deploy.sh        # Docker deployment automation
│   └── deploy-production.sh    # Production deployment script
└── maintenance/           # Maintenance and data management
    └── update-game-slugs.js    # Update game slugs in cache
```

## 🗄️ Database Scripts

### `database/db-manager.js` ⭐ **Unified Database Manager**

Consolidated database operations script that replaces 4 separate scripts. Handles initialization, migrations, cache management, and maintenance.

```bash
node scripts/database/db-manager.js <command>

Commands:
  init     - Initialize database with core tables
  migrate  - Run pending database migrations
  status   - Show migration status and pending migrations
  warm     - Warm up the games cache
  stats    - Show cache statistics
  sync     - Sync data to Typesense search engine
  fix      - Fix migration table issues
```

### `database/setup-postgres.js`

Direct PostgreSQL setup script for when you have direct database access instead of cloud services.

```bash
node scripts/database/setup-postgres.js setup
```

## 🐳 Deployment Scripts

### `deployment/docker-entrypoint.js`

Docker container entry point that handles database migrations and application startup.

Used automatically in Docker containers. Handles:

- Environment variable validation
- Database migration execution
- Application startup coordination

### `deployment/docker-cleanup.sh`

Docker cleanup utilities for resolving common Docker production issues.

```bash
bash scripts/deployment/docker-cleanup.sh
```

### `deployment/docker-deploy.sh`

Automated Docker deployment script.

```bash
bash scripts/deployment/docker-deploy.sh
```

### `deployment/deploy-production.sh`

Production deployment script with security settings and health checks.

```bash
bash scripts/deployment/deploy-production.sh
```

## 🔧 Maintenance Scripts

### `maintenance/update-game-slugs.js`

Update existing cached games with generated slugs. Run this after implementing slug generation to update existing data.

```bash
node scripts/maintenance/update-game-slugs.js
```

## 🚀 Quick Usage Examples

### Database Setup and Migration

```bash
# Initialize database
node scripts/database/db-manager.js init

# Run all pending migrations
node scripts/database/db-manager.js migrate

# Check migration status
node scripts/database/db-manager.js status

# Warm up cache
node scripts/database/db-manager.js warm
```

### Docker Deployment

```bash
# Deploy with Docker
bash scripts/deployment/docker-deploy.sh

# Clean up Docker issues
bash scripts/deployment/docker-cleanup.sh
```

### Maintenance Operations

```bash
# Update game slugs
node scripts/maintenance/update-game-slugs.js
```

## 🔒 Security Notes

- All scripts require appropriate environment variables to be set
- Database scripts require database credentials
- Deployment scripts should be run with appropriate permissions
- Always test scripts in development before running in production

## 📝 Adding New Scripts

When adding new scripts:

1. Place them in the appropriate category directory
2. Add appropriate shebang and documentation
3. Update this README with usage instructions
4. Follow the established naming conventions
5. Include error handling and logging

## 🆘 Troubleshooting

- **Permission denied**: Ensure scripts have execute permissions (`chmod +x script.sh`)
- **Module not found**: Ensure you're running from the project root directory
- **Database connection errors**: Check environment variables and database connectivity
- **Docker issues**: Use the `docker-cleanup.sh` script to resolve common problems

---

For additional help, see the [main documentation](../README.md#-documentation) or [quick start guide](../docs/setup/QUICKSTART.md).
