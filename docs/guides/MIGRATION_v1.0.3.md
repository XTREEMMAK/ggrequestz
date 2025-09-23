# Migration Guide: v1.0.2 → v1.0.3

## Overview

Version 1.0.3 standardizes Docker deployment to use the conventional `.env` file instead of `.env.docker`, making deployment as simple as `docker compose up -d`. This guide covers migrating from v1.0.2 to v1.0.3.

## What Changed

### Environment File Standardization

- **v1.0.2**: Used custom deployment script with `.env.docker`
- **v1.0.3**: Uses standard Docker Compose with `.env` (community expectation)

### Key Benefits

- ✅ Standard `docker compose up -d` deployment
- ✅ Follows Docker Compose conventions
- ✅ Easier for new users to understand
- ✅ Cleaner separation of development vs production environments

## Migration Process

### 1. Backup Your Current Setup

Before migrating, backup your existing configuration:

```bash
# Backup your environment configuration
cp .env.docker .env.docker.backup

# Backup database (recommended)
docker exec ggrequestz-postgres pg_dump -U postgres ggrequestz > backup_$(date +%Y%m%d).sql
```

### 2. Stop Current Services

```bash
# Stop v1.0.2 deployment
docker compose down

# Optional: Remove old images to force rebuild
docker rmi $(docker images -q ggrequestz)
```

### 3. Update Environment Configuration

The environment variables remain the same, just the file location changes:

```bash
# Copy your production configuration to the new standard location
cp .env.docker .env
```

**Important**: Your database and volumes are preserved during this process.

### 4. Deploy v1.0.3

With v1.0.3, deployment is now standardized:

```bash
# Standard Docker Compose deployment (new way)
docker compose up -d

# This replaces the old custom script method:
# ./scripts/deployment/deploy-production.sh
```

### 5. Verify Migration

Check that everything is running correctly:

```bash
# Check service status
docker compose ps

# Check application health
curl -f http://localhost:3000/api/health

# Check logs if needed
docker compose logs ggrequestz
```

## Environment Variable Comparison

| Component             | v1.0.2              | v1.0.3                          |
| --------------------- | ------------------- | ------------------------------- |
| **Docker Production** | `.env.docker`       | `.env`                          |
| **Local Development** | `.env`              | `.env.dev`                      |
| **Docker Build**      | `.env.docker-build` | `.env.docker-build` (unchanged) |
| **Template**          | `.env.example`      | `.env.example` (unchanged)      |

## Database Compatibility

✅ **No database changes** - Your existing PostgreSQL database will work without modification.

✅ **Volume preservation** - All Docker volumes (database, Redis, Typesense) are preserved.

✅ **Migration system** - Existing migration system handles any future schema changes.

## Rollback Plan

If you need to revert to v1.0.2:

```bash
# Stop v1.0.3 services
docker compose down

# Restore old environment file naming
mv .env .env.v103.backup
mv .env.docker.backup .env.docker

# Use the old deployment method
./scripts/deployment/deploy-production.sh
```

## Development Environment Changes

For contributors and developers:

### v1.0.2 Development

```bash
# Used .env for local development
npm run dev
```

### v1.0.3 Development

```bash
# Now uses .env.dev for local development
# Update any local tooling to use .env.dev
npm run dev
```

## Common Migration Issues

### Issue: "Environment file not found"

**Solution**: Ensure you copied `.env.docker` to `.env`

```bash
cp .env.docker .env
```

### Issue: "Database connection failed"

**Solution**: Verify database environment variables in `.env`

```bash
# Check these are set in .env:
POSTGRES_PASSWORD=your_password
POSTGRES_DB=ggrequestz
POSTGRES_USER=postgres
```

### Issue: "Services fail to start"

**Solution**: Check Docker Compose logs

```bash
docker compose logs
```

## Support

- **Quick Start**: See main README.md for new simplified deployment
- **Advanced Configuration**: See docs for custom deployment scenarios
- **Issues**: Report at GitHub issues if you encounter problems

## Summary

v1.0.3 makes deployment simpler and more standard:

**Before (v1.0.2)**:

```bash
./scripts/deployment/deploy-production.sh
```

**After (v1.0.3)**:

```bash
docker compose up -d
```

Your data and configuration are preserved, just accessed through the standard `.env` file location.
