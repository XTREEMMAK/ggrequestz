# 🐳 G.G Requestz Docker Setup Guide

This guide will help you deploy GameRequest using Docker with full production setup including PM2 process management, PostgreSQL database, and Typesense search engine.

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- At least 2GB RAM
- 10GB available disk space

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd ggrequestz

# Copy Docker environment template
cp .env.docker .env

# Edit configuration (required)
nano .env
```

### 2. Configure Required Services

Edit `.env` file with your actual values:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password

# Authentication (Authentik)
AUTHENTIK_CLIENT_ID=your_client_id
AUTHENTIK_CLIENT_SECRET=your_client_secret
AUTHENTIK_ISSUER=https://auth.yourdomain.com/application/o/ggrequestz

# Session Security
SESSION_SECRET=generate_32_plus_character_random_string

# IGDB API (from Twitch Developer Console)
IGDB_CLIENT_ID=your_igdb_client_id
IGDB_CLIENT_SECRET=your_igdb_client_secret

# Search Engine
TYPESENSE_API_KEY=your_search_api_key
```

### 3. Start Core Services

```bash
# Start main application stack
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f ggrequestz
```

### 4. Initialize Database

The database schema is automatically initialized on first startup. Monitor the logs:

```bash
# Watch initialization
docker-compose logs -f ggrequestz | grep -E "(Database|Schema|Migration)"

# Manually trigger if needed
docker-compose exec ggrequestz node scripts/init-database.js init
```

## 🔧 Service Configuration

### Core Services

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| GameRequest App | 3000 | Main application | Required |
| PostgreSQL | 5432 | Database | Required |
| Typesense | 8108 | Search engine | Required |

### Optional Services

```bash
# Start with notifications
docker-compose --profile notifications up -d

# Start with reverse proxy
docker-compose --profile proxy up -d

# Start everything
docker-compose --profile notifications --profile proxy up -d
```

| Service | Port | Purpose | Profile |
|---------|------|---------|---------|
| Gotify | 8080 | Push notifications | `notifications` |
| Traefik | 80/443 | Reverse proxy | `proxy` |

## 📊 Monitoring and Management

### Health Checks

```bash
# Check application health
curl http://localhost:3000/api/health

# Check all services
docker-compose ps
```

### PM2 Process Management

```bash
# View PM2 status
docker-compose exec ggrequestz pm2 status

# View PM2 logs  
docker-compose exec ggrequestz pm2 logs

# Restart application
docker-compose exec ggrequestz pm2 restart ggrequestz

# Monitor resources
docker-compose exec ggrequestz pm2 monit
```

### Database Management

```bash
# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d ggrequestz

# Backup database
docker-compose exec postgres pg_dump -U postgres ggrequestz > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U postgres -d ggrequestz
```

### Search Engine Management

```bash
# Check Typesense health
curl http://localhost:8108/health

# View search collections
curl http://localhost:8108/collections -H "X-TYPESENSE-API-KEY: your_api_key"

# Sync games to search
docker-compose exec ggrequestz node scripts/init-database.js sync
```

## 🔐 Production Deployment

### 1. Security Configuration

```bash
# Generate secure passwords
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 48  # For SESSION_SECRET
openssl rand -base64 24  # For TYPESENSE_API_KEY
```

### 2. Resource Limits

Add to `docker-compose.yml`:

```yaml
services:
  ggrequestz:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
```

### 3. SSL/TLS with Traefik

Enable proxy profile and configure:

```bash
# Set domain in .env
DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com

# Start with proxy
docker-compose --profile proxy up -d
```

### 4. Backup Strategy

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec postgres pg_dump -U postgres ggrequestz > "backup_${DATE}.sql"
docker-compose exec typesense curl -o "search_backup_${DATE}.tar.gz" \
  -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" \
  http://localhost:8108/operations/snapshot?snapshot_path=/data/backup
EOF

chmod +x backup.sh
```

## 🐛 Troubleshooting

### Common Issues

**Database Connection Error:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

**Search Not Working:**
```bash
# Check Typesense
curl http://localhost:8108/health

# Rebuild search index  
docker-compose exec ggrequestz node scripts/init-database.js sync
```

**Application Won't Start:**
```bash
# Check environment variables
docker-compose config

# Check PM2 status
docker-compose exec ggrequestz pm2 status

# View application logs
docker-compose logs -f ggrequestz
```

**Out of Memory:**
```bash
# Check container resources
docker stats

# Adjust PM2 instances
echo "PM2_INSTANCES=2" >> .env
docker-compose up -d
```

### Performance Tuning

**Database Optimization:**
```sql
-- Connect to database and run:
ANALYZE;
REINDEX DATABASE ggrequestz;
VACUUM ANALYZE;
```

**Application Scaling:**
```bash
# Scale to specific instance count
echo "PM2_INSTANCES=4" >> .env
docker-compose up -d

# Scale based on CPU cores
echo "PM2_INSTANCES=max" >> .env
docker-compose up -d
```

## 📈 Monitoring and Logs

### Log Management

```bash
# View all logs
docker-compose logs

# Follow specific service
docker-compose logs -f ggrequestz

# View PM2 logs inside container
docker-compose exec ggrequestz pm2 logs --json | jq .

# View last 100 lines
docker-compose logs --tail=100 ggrequestz
```

### Resource Monitoring

```bash
# Container resource usage
docker stats

# Disk usage
docker system df

# Clean up unused resources
docker system prune
```

## 🔄 Updates and Maintenance

### Application Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build --no-cache ggrequestz
docker-compose up -d ggrequestz
```

### Database Migrations

```bash
# Run migrations
docker-compose exec ggrequestz node scripts/init-database.js init

# Check migration status
docker-compose logs ggrequestz | grep -i migration
```

### Backup Rotation

```bash
# Weekly backup with cleanup
0 2 * * 0 /path/to/backup.sh && find /backup -name "backup_*.sql" -mtime +30 -delete
```

## 🛡️ Security Best Practices

1. **Change default passwords** in `.env`
2. **Use strong SESSION_SECRET** (32+ characters)
3. **Enable firewall** rules for ports
4. **Regular security updates**:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```
5. **Monitor logs** for suspicious activity
6. **Backup encryption** for sensitive data
7. **Network isolation** using Docker networks

## 📞 Support

- **Logs**: Always check `docker-compose logs` first
- **Health**: Use `/api/health` endpoint for diagnostics
- **Database**: Monitor PostgreSQL query performance
- **Search**: Verify Typesense index integrity
- **Resources**: Monitor memory and CPU usage

---

**Production Checklist:**
- [ ] All environment variables configured
- [ ] Database initialized successfully  
- [ ] Search index populated
- [ ] SSL certificates configured (if using proxy)
- [ ] Backups scheduled
- [ ] Monitoring setup
- [ ] Resource limits configured
- [ ] Security hardening applied