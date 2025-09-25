# GG Requestz Integration Guide

Complete guide for integrating GG Requestz with your existing systems including authentication, ROMM library integration, and external services.

## Quick Setup

### 1. Choose Provider

- **Authentik/OIDC**: OAuth/OpenID Connect providers
- **API Integration**: Sync via REST API calls
- **Webhook Integration**: Real-time updates via webhooks
- **Local Auth**: Traditional username/password

### 2. Environment Configuration

```bash
AUTH_PROVIDER=local_auth  # Set your provider
SESSION_SECRET=your-secret

# Provider-specific variables (see sections below)
```

### 3. Admin Configuration

Visit `/admin/integrations` to complete setup via web interface.

## Provider Setup

### Authentik OIDC

```bash
AUTH_PROVIDER=authentik
AUTHENTIK_CLIENT_ID=your-client-id
AUTHENTIK_CLIENT_SECRET=your-client-secret
AUTHENTIK_ISSUER=https://auth.example.com/application/o/gamerequest
```

**Redirect URI:** `https://your-domain.com/api/auth/callback`

### Generic OIDC (Keycloak, Auth0, Azure AD)

```bash
AUTH_PROVIDER=oidc_generic
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_ISSUER=https://your-provider.com
OIDC_SCOPE=openid profile email
```

### API Integration

```bash
AUTH_PROVIDER=api_integration
API_BASE_URL=https://your-api.com
API_KEY=your-api-key
ENABLE_AUTO_SYNC=true
SYNC_INTERVAL=300000
```

**Required API Endpoints:**

- `POST /api/auth/login` - User authentication
- `GET /api/users/{id}` - Get user details
- `GET /api/users/sync` - Bulk user sync

### Webhook Integration

```bash
AUTH_PROVIDER=webhook_integration
WEBHOOK_SECRET=your-webhook-secret
WEBHOOK_VALIDATE_SIGNATURE=true
```

**Webhook URL:** `https://your-domain.com/api/integrations/webhook`

**Supported Events:** `user.created`, `user.updated`, `user.deleted`, `user.role_changed`

### Local Authentication

```bash
AUTH_PROVIDER=local_auth
SESSION_SECRET=your-session-secret
```

No additional configuration needed.

## ROMM Library Integration

### Overview

ROMM (ROM Manager) integration allows GG Requestz to:

- Display game availability from your ROMM library
- Cross-reference requested games with your collection
- Show real-time library status
- Provide direct links to games in ROMM

### ROMM Configuration

```bash
# Required ROMM settings
ROMM_SERVER_URL=http://your-romm-server:8080
ROMM_USERNAME=your-romm-username
ROMM_PASSWORD=your-romm-password
```

### ROMM Setup Steps

1. **Verify ROMM Access**
   - Ensure your ROMM instance is accessible from GG Requestz
   - Test basic connectivity to the ROMM web interface

2. **Create ROMM User Account**
   - Create a dedicated user account in ROMM
   - Assign "Editor" or "Admin" role for API access
   - "Viewer" role will not work for API calls

3. **Test Connection**
   ```bash
   curl -X POST http://your-ggrequestz-server/api/setup/check \
     -H "Content-Type: application/json" \
     -d '{"service": "romm_library"}'
   ```
   Should return: `{"success": true}`

### ROMM Integration Features

- **Library Status**: Shows if games are available in your ROMM collection
- **Cross-Reference**: Automatically matches IGDB games with ROMM library
- **Direct Links**: Provides links to play games directly in ROMM
- **Real-time Updates**: Library status updates as you add/remove games

### Troubleshooting ROMM Integration

**Common Issues:**

1. **Connection Refused**
   - Verify `ROMM_SERVER_URL` includes the protocol (http:// or https://)
   - Check network connectivity between GG Requestz and ROMM
   - Ensure ROMM is running and accessible

2. **403 Forbidden Errors**
   - User account needs "Editor" or "Admin" role in ROMM
   - "Viewer" role cannot access API endpoints
   - Consider using API key authentication instead

3. **Authentication Failed**
   - Verify username/password are correct
   - Try logging into ROMM web interface with same credentials
   - Check for special characters in password that need escaping

4. **API Key Issues**
   - Ensure API key has proper permissions
   - Test API key directly with ROMM API
   - Regenerate API key if needed

**Testing Commands:**

```bash
# Test ROMM authentication directly
curl -X POST http://your-romm-server/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_USERNAME&password=YOUR_PASSWORD"

# Test API access with token
curl -H "Authorization: Bearer <token>" \
     http://your-romm-server/api/platforms?size=1

# Test GG Requestz connection
curl -X POST http://your-ggrequestz-server/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "romm_library"}'
```

For detailed ROMM troubleshooting, see [ROMM_TROUBLESHOOTING.md](ROMM_TROUBLESHOOTING.md).

## API Endpoints

- `GET /api/integrations/config` - View current configuration
- `POST /api/integrations/config` - Update provider settings
- `POST /api/integrations/sync` - Manual user synchronization
- `POST /api/integrations/webhook` - Webhook receiver endpoint

## Docker Setup

```yaml
services:
  gamerequest:
    environment:
      - AUTH_PROVIDER=authentik
      - AUTHENTIK_CLIENT_ID=${AUTHENTIK_CLIENT_ID}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
```

## Other External Integrations

### Gotify Notifications

```bash
GOTIFY_URL=http://your-gotify-server
GOTIFY_TOKEN=your-app-token
```

**Features:**

- Admin notifications for security violations
- User request notifications
- System alerts and warnings

### n8n Webhooks

```bash
N8N_WEBHOOK_URL=http://your-n8n-server/webhook/endpoint
```

**Features:**

- Workflow automation on user requests
- Custom notification systems
- External system integrations

## General Troubleshooting

### Basic Steps

1. **Clear browser cache** - Resolves many caching issues
2. **Check service connectivity** using `/api/setup/check` endpoint
3. **Review application logs** for detailed error information
4. **Verify environment variables** are properly set

### Authentication Issues

**OIDC Issues:**

- Verify redirect URI matches exactly: `https://your-domain.com/api/auth/callback`
- Check client ID and secret are correct
- Ensure OIDC provider is accessible

**API Sync Issues:**

- Check API endpoints and authentication
- Verify API keys have proper permissions
- Test endpoints manually with curl

**Webhook Issues:**

- Validate signature calculation and Content-Type
- Check webhook secret matches
- Ensure webhook URL is accessible

### Database Queries for Troubleshooting

```sql
-- Check recent activity
SELECT * FROM ggr_activity_log WHERE action LIKE 'sync_%' ORDER BY created_at DESC LIMIT 20;

-- Check security logs
SELECT * FROM ggr_security_logs ORDER BY created_at DESC LIMIT 10;

-- Check ROMM integration status
SELECT * FROM ggr_system_settings WHERE key = 'romm_integration';
```

### Service Validation

```bash
# Test all service connections
curl -X POST http://your-server/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "all"}'

# Test specific services
curl -X POST http://your-server/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "romm_library"}'

curl -X POST http://your-server/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "igdb_api"}'
```

For detailed setup help, visit `/admin/integrations` in your GG Requestz installation.
