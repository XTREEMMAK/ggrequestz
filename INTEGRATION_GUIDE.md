# G.G Requestz User Integration Guide

GameRequest supports 5 authentication methods to integrate with your existing user systems.

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

## Troubleshooting

**OIDC Issues:** Verify redirect URI and client credentials  
**API Sync Issues:** Check API endpoints and authentication  
**Webhook Issues:** Validate signature calculation and Content-Type

**Activity Logs:**
```sql
SELECT * FROM ggr_activity_log WHERE action LIKE 'sync_%' ORDER BY created_at DESC LIMIT 20;
```

For detailed setup help, visit `/admin/integrations` in your GameRequest installation.