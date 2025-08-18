# 🐳 G.G Requestz Docker Testing Guide

This guide provides comprehensive instructions for testing GameRequest with Docker in various configurations.

## 📋 Prerequisites

Before starting, ensure you have:

- Docker and Docker Compose installed
- At least 2GB of available RAM
- 5GB of free disk space
- Access to create environment files

## 🚀 Quick Start (All Services Included)

The fastest way to test GameRequest with all services running locally:

```bash
# Clone the repository
git clone <repository-url>
cd ggrequestz

# Copy and configure environment
cp .env.example .env

# Edit .env with your required values (see Configuration section below)
nano .env

# Start with all local services
docker compose --profile database --profile cache --profile search up -d

# Or use the convenience script
docker compose --profile all up -d
```

## 🔧 Configuration Examples

### Minimal Required Configuration

Create a `.env` file with these minimum required settings:

```bash
# Database
POSTGRES_PASSWORD=your_secure_db_password

# Authentication (choose one method)
# Option 1: Authentik OIDC
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_ISSUER=https://auth.yourdomain.com
SESSION_SECRET=your_32_char_random_string

# Option 2: Basic Auth (will prompt for admin creation)
# Leave Authentik vars empty to use basic auth

# IGDB API (required)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret
```

### Full Configuration Example

```bash
# Database Configuration
POSTGRES_PASSWORD=secure_password_123
POSTGRES_DB=ggrequestz
POSTGRES_USER=postgres

# Application
APP_PORT=3000
NODE_ENV=production
SESSION_SECRET=your_very_long_random_secret_string_here

# Authentication - Authentik OIDC
AUTHENTIK_CLIENT_ID=your_authentik_client_id
AUTHENTIK_CLIENT_SECRET=your_authentik_client_secret
AUTHENTIK_ISSUER=https://auth.example.com

# IGDB API
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret

# Search Engine
TYPESENSE_API_KEY=secure_search_key_123

# Cache
REDIS_EXTERNAL_PORT=6379

# Optional Services
GOTIFY_URL=https://notifications.example.com
GOTIFY_TOKEN=your_gotify_token
ROMM_SERVER_URL=https://romm.example.com
ROMM_USERNAME=your_romm_user
ROMM_PASSWORD=your_romm_password
N8N_WEBHOOK_URL=https://workflows.example.com/webhook

# Optional: Proxy
DOMAIN=example.com
ACME_EMAIL=admin@example.com
```

## 🏗️ Deployment Scenarios

### 1. Full Stack (Recommended for Testing)

Runs all services locally including database, cache, and search:

```bash
# Start everything
docker compose --profile database --profile cache --profile search up -d

# Check status
docker compose ps

# View logs
docker compose logs -f ggrequestz
```

**Services included:**

- GameRequest application
- PostgreSQL database
- Redis cache
- Typesense search engine

### 2. Minimal Stack (App Only)

Use when you have external services:

```bash
# Start only the application
docker compose up ggrequestz -d

# Or use external services override
docker compose -f docker-compose.yml -f docker-compose.external.yml up -d
```

**Services included:**

- GameRequest application only
- Requires external PostgreSQL, Redis, and Typesense

### 3. Partial Stack Examples

#### With Database Only

```bash
docker compose --profile database up -d
```

#### With Database and Cache

```bash
docker compose --profile database --profile cache up -d
```

#### With All Core Services

```bash
docker compose --profile database --profile cache --profile search up -d
```

### 4. Development Stack

Includes additional services for development:

```bash
# Start with optional services
docker compose --profile database --profile cache --profile search --profile notifications up -d
```

## 🌐 External Services Configuration

### External PostgreSQL

If you have an existing PostgreSQL server:

```bash
# In your .env file
POSTGRES_HOST=your-db-host.com
POSTGRES_PORT=5432
POSTGRES_DB=ggrequestz
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password

# Start without local database
docker compose up ggrequestz -d
```

### External Redis

If you have an existing Redis server:

```bash
# In your .env file
REDIS_URL=redis://your-redis-host:6379

# Or with authentication
REDIS_URL=redis://:password@your-redis-host:6379

# Start without local cache
docker compose --profile database --profile search up -d
```

### External Typesense

If you have an existing Typesense server:

```bash
# In your .env file
TYPESENSE_HOST=your-search-host.com
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=your_api_key

# Start without local search
docker compose --profile database --profile cache up -d
```

## 🧪 Testing Procedures

### 1. Health Checks

Check if all services are healthy:

```bash
# Check container health
docker compose ps

# Test application health endpoint
curl http://localhost:3000/api/health

# Check individual service logs
docker compose logs postgres
docker compose logs redis
docker compose logs typesense
```

### 2. Database Testing

Verify database connection and data:

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d ggrequestz

# Check tables
\dt

# Check migrations
SELECT * FROM ggr_migrations;

# Exit
\q
```

### 3. Cache Testing

Test Redis cache functionality:

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Test cache
PING
INFO memory
KEYS *

# Exit
exit
```

### 4. Search Testing

Test Typesense search engine:

```bash
# Check Typesense status
curl http://localhost:8108/health

# Check collections
curl http://localhost:8108/collections \
  -H "X-TYPESENSE-API-KEY: xyz123"
```

### 5. Application Testing

Test the application functionality:

```bash
# Test homepage (should redirect to login/setup)
curl -I http://localhost:3000

# Test API endpoints
curl http://localhost:3000/api/health

# Test setup flow (if using basic auth)
curl http://localhost:3000/setup
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Permission Denied Errors

```bash
# Fix Docker permissions (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Fix file permissions
sudo chown -R $USER:$USER ./
```

#### 2. Port Conflicts

```bash
# Check what's using ports
netstat -tulpn | grep :3000
netstat -tulpn | grep :5432
netstat -tulpn | grep :6379

# Change ports in .env
APP_PORT=3001
POSTGRES_EXTERNAL_PORT=5433
REDIS_EXTERNAL_PORT=6380
```

#### 3. Database Connection Issues

```bash
# Check database logs
docker compose logs postgres

# Test connection manually
docker compose exec postgres pg_isready -U postgres

# Reset database
docker compose down postgres
docker volume rm ggrequestz_postgres-data
docker compose up postgres -d
```

#### 4. Memory Issues

```bash
# Check memory usage
docker stats

# Reduce Redis memory limit
# In docker-compose.yml, change:
# --maxmemory 128mb

# Reduce PM2 instances
# In .env:
PM2_INSTANCES=1
```

### Service-Specific Troubleshooting

#### PostgreSQL Issues

```bash
# Check PostgreSQL logs
docker compose logs postgres

# Access PostgreSQL directly
docker compose exec postgres psql -U postgres

# Reset PostgreSQL data
docker compose down postgres
docker volume rm ggrequestz_postgres-data
```

#### Redis Issues

```bash
# Check Redis logs
docker compose logs redis

# Access Redis CLI
docker compose exec redis redis-cli

# Clear Redis cache
docker compose exec redis redis-cli FLUSHALL
```

#### Typesense Issues

```bash
# Check Typesense logs
docker compose logs typesense

# Reset Typesense data
docker compose down typesense
docker volume rm ggrequestz_typesense-data
```

## 📊 Performance Testing

### Load Testing Setup

```bash
# Install testing tools
sudo apt install apache2-utils curl

# Basic load test
ab -n 100 -c 10 http://localhost:3000/

# API endpoint test
ab -n 50 -c 5 http://localhost:3000/api/health

# Monitor during tests
docker stats
```

### Memory and Resource Monitoring

```bash
# Monitor resource usage
watch docker stats

# Check disk usage
docker system df

# Check individual container resources
docker compose exec ggrequestz top
docker compose exec postgres top
```

## 🔄 Update Testing

Test database migrations and updates:

```bash
# Test migration process
docker compose exec ggrequestz node scripts/run-migrations.js

# Backup before updates
docker compose exec postgres pg_dump -U postgres ggrequestz > backup.sql

# Test rolling updates
docker compose pull
docker compose up -d --no-recreate
```

## 🧹 Cleanup

Clean up test environments:

```bash
# Stop and remove containers
docker compose down

# Remove volumes (WARNING: destroys data)
docker compose down -v

# Remove images
docker rmi $(docker images "ggrequestz*" -q)

# Full cleanup
docker system prune -a --volumes
```

## 📋 Testing Checklist

Use this checklist to verify your deployment:

- [ ] Environment file configured with required values
- [ ] All containers start successfully
- [ ] Health checks pass for all services
- [ ] Application accessible on configured port
- [ ] Database connection established
- [ ] Cache connection working (if enabled)
- [ ] Search engine accessible (if enabled)
- [ ] Setup wizard completes (for basic auth)
- [ ] Login process works
- [ ] Game search functionality works
- [ ] Request submission works
- [ ] Admin panel accessible
- [ ] External integrations work (if configured)

## 🆘 Support

If you encounter issues during testing:

1. Check the logs: `docker compose logs -f`
2. Verify your `.env` configuration
3. Ensure all required environment variables are set
4. Check the troubleshooting section above
5. Consult the main README.md for additional configuration help

For persistent issues, please check the project's issue tracker or documentation.

---

**Happy Testing! 🚀**
