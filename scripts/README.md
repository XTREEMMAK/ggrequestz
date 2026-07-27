# 🛠️ GG Requestz Scripts

This directory contains utility scripts for database management, deployment, and maintenance operations.

## 📂 Directory Structure

```
scripts/
├── README.md              # This index file
├── create-release.sh           # Cut a release; see docs/guides/RELEASE_GUIDE.md
├── healthcheck.cjs             # Docker HEALTHCHECK probe
├── database/              # Database and migration scripts
│   ├── db-manager.js           # Unified database management
│   └── setup-postgres.js       # Direct PostgreSQL setup
├── deployment/            # Deployment and Docker scripts
│   ├── docker-entrypoint.js    # Docker container entry point
│   ├── docker-cleanup.sh       # Docker cleanup utilities
│   ├── docker-deploy.sh        # Docker deployment automation
│   └── deploy-production.sh    # Production deployment script
├── maintenance/           # Maintenance and data management
│   └── update-game-slugs.js    # Update game slugs in cache
└── testing/               # Local test stack fixtures — see docs/setup/TESTING.md
    ├── seed-app.sh             # Initial admin, via the app's first-run endpoint
    ├── seed-data.js            # Games, users, requests, watchlist fixtures
    ├── seed-romm.sh            # RomM admin, API token, and a 403 repro account
    └── seed-keycloak.sh        # OIDC client and test user
```

## 🗄️ Database Scripts

### `database/db-manager.js` ⭐ **Unified Database Manager**

Consolidated database operations script. Handles initialization, migrations, cache management, and maintenance.

```bash
node scripts/database/db-manager.js <command>

Commands:
  init     - Initialize database with core tables
  migrate  - Run pending database migrations
  status   - Show migration status and pending migrations
  warm     - Warm up the games cache
  stats    - Show cache statistics
  fix      - Fix migration table issues
```

There is no `seed` command: migrations create the schema and system roles but no
domain data, and demo fixtures belong to the test stack rather than to the
production database tool. Use `scripts/testing/seed-data.js` for those.

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

## 🧪 Testing Scripts

Fixtures for the local Docker test stack. They target `127.0.0.1` on the test
stack's ports and are not for use against a real deployment. See
[docs/setup/TESTING.md](../docs/setup/TESTING.md).

Normally you do not run these directly — `make test-seeded` does.

### `testing/seed-app.sh`

Creates the initial admin through the app's own first-run endpoint
(`POST /api/auth/basic/setup`), so the password is hashed and the admin role
assigned the way a real installation does it. Also waits for the app's database
to report healthy, which is what makes it safe to run right after the stack
starts.

### `testing/seed-data.js`

Inserts 30 games, two non-admin users, one request per status, watchlist entries
and a custom navigation link. Runs offline and is idempotent. It refuses to run
against a database holding non-fixture games unless given `--force`, and it does
not read the repo `.env`.

### `testing/seed-romm.sh` and `testing/seed-keycloak.sh`

Provision the RomM and Keycloak fixture containers and print the environment
blocks to configure the app with. `seed-romm.sh` also creates an
under-privileged account that reproduces the RomM 403 outage.

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
