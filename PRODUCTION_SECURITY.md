# G.G Requestz Production Security Configuration

## Overview

Your G.G Requestz application has been configured with comprehensive production-grade security features that automatically activate when `NODE_ENV=production` is set in your `.env.docker` file.

## Security Features Implemented

### 🔒 **Rate Limiting**
- **Authentication endpoints**: 5 attempts per 15 minutes (vs 100 in development)
- **API endpoints**: 100 requests per 15 minutes (vs 200 in development)
- **Search endpoints**: 60 requests per minute (vs 120 in development)
- **Upload endpoints**: 10 uploads per hour (vs 50 in development)
- **Redis-based distributed limiting** for scalability

### 🛡️ **Session Security**
- **Session hijacking protection** with device fingerprinting
- **Secure session rotation** every hour
- **Failed login lockout**: 5 attempts → 15-minute lockout (vs 10 attempts → 5-minute in dev)
- **64-character cryptographically secure session secret**

### 🧹 **XSS Protection**
- **Input sanitization** for all POST/PUT/PATCH requests
- **Malicious pattern blocking** (scripts, javascript:, event handlers)
- **Content-Type based filtering**
- **Field-specific sanitization** for sensitive inputs

### 📋 **Security Headers**
- **X-Frame-Options**: DENY (clickjacking protection)
- **X-Content-Type-Options**: nosniff (MIME type sniffing protection)
- **X-XSS-Protection**: 1; mode=block (browser XSS filtering)
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Content-Security-Policy**: Strict policy with CDN allowances for Vanta.js
- **Permissions-Policy**: Disables geolocation, microphone, camera
- **HSTS**: Enabled automatically for HTTPS deployments

## Production Configuration Changes

### Environment Variables Added/Modified:
```bash
# Core Production Setting
NODE_ENV=production

# Enhanced Security
SESSION_SECRET='mVAt9sV7YbzYwHFuJyQacHN2wqgNLWluPaBJG8WYyieCLh31ug7dMNx7mfiJ7FWt'
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
ENABLE_SESSION_FINGERPRINTING=true
ENABLE_CSRF_PROTECTION=true

# Database Production Settings
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_CONNECTION_TIMEOUT=60000

# Redis Configuration
REDIS_MAX_MEMORY=512mb
REDIS_PERSISTENCE=true

# PM2 Process Management
PM2_CRON_RESTART=0 2 * * *
PM2_MAX_MEMORY_RESTART=1500M

# Logging & Monitoring
LOG_LEVEL=info
LOG_ROTATION_MAX_SIZE=10m
LOG_ROTATION_MAX_FILES=5
HEALTH_CHECK_INTERVAL=30s
```

## Deployment Commands

### Production Deployment:
```bash
# Using the provided script (recommended)
./scripts/deploy-production.sh

# Manual deployment
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

### Development (unchanged):
```bash
# Local development
npm run dev

# Docker development
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d
```

## Security Testing

### Automated Testing:
```bash
# Test current environment
node scripts/test-security.js

# Test with Docker environment flag
DOCKER_ENV=1 node scripts/test-security.js

# Test production URL
TEST_URL=https://ggr.keyjaycompound.com node scripts/test-security.js
```

### Manual Security Verification:
```bash
# Check security headers
curl -I https://ggr.keyjaycompound.com/login

# Test rate limiting (should get 429 after 5 attempts)
for i in {1..10}; do curl -X POST https://ggr.keyjaycompound.com/api/auth/login; done

# Verify session security
curl -H "Cookie: session=invalid_token" https://ggr.keyjaycompound.com/
```

## Security Monitoring

### Logs to Monitor:
- **Rate limit violations**: Look for 429 responses in logs
- **Session security events**: Failed fingerprint validations
- **XSS attempts**: Sanitized input warnings
- **Authentication failures**: Failed login attempts

### Health Checks:
- **Application**: `https://ggr.keyjaycompound.com/api/health`
- **Service status**: `docker compose ps`
- **Resource usage**: `docker stats`

## Important Security Notes

### ⚠️ **Production vs Development**
- Security settings are **environment-aware**
- Development workflow remains **completely unchanged**
- Only Docker production deployment gets hardened security
- All debugging features preserved in development

### 🔧 **Maintenance**
- **Daily PM2 restart** at 2 AM for memory cleanup
- **Log rotation** prevents disk space issues
- **Health checks** every 30 seconds with auto-restart
- **Redis persistence** prevents cache loss on restart

### 🚨 **Security Incident Response**
1. **Rate limit exceeded**: Check logs for suspicious IPs
2. **Session hijacking detected**: Logs will show fingerprint mismatches
3. **XSS attempts**: Input sanitization logs will show blocked content
4. **Authentication attacks**: Monitor failed login attempt patterns

## Performance Impact

### Expected Improvements:
- **Redis caching**: 80-90% faster response times for cached content
- **Resource limits**: Prevents memory exhaustion
- **Connection pooling**: Better database performance under load
- **Gzip compression**: Reduced bandwidth usage

### Monitoring:
- **Response times**: Check `X-Response-Time` header
- **Memory usage**: PM2 auto-restart if >1.5GB
- **CPU usage**: Docker resource limits prevent overload

## Backup & Recovery

### Data Persistence:
- **PostgreSQL**: Data persisted in Docker volumes
- **Redis**: Persistence enabled with AOF and RDB snapshots
- **Logs**: Rotated and preserved for analysis

### Backup Strategy:
```bash
# Database backup
docker compose exec postgres pg_dump -U postgres ggrequestz > backup.sql

# Complete environment backup
docker compose down
tar -czf backup-$(date +%Y%m%d).tar.gz .
```

## Support & Troubleshooting

### Common Issues:
1. **Rate limiting too strict**: Check IP whitelist configuration
2. **Session issues**: Clear browser cookies and re-login
3. **HTTPS problems**: Verify SSL certificate and domain configuration
4. **Performance issues**: Check Docker resource limits and logs

### Getting Help:
- **Application logs**: `docker compose logs -f ggrequestz`
- **All service logs**: `docker compose logs -f`
- **Security test results**: `node scripts/test-security.js`

---

**Last Updated**: $(date)
**Security Level**: Production-Grade
**Deployment Status**: Ready for Production