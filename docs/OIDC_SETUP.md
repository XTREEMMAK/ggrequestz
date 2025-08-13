# Generic OIDC Provider Setup Guide

This guide explains how to configure GG Requestz with any OIDC-compliant authentication provider.

## Supported Providers

GG Requestz supports any OIDC-compliant provider including:
- Keycloak
- Auth0
- Okta
- Azure Active Directory
- Google Identity Platform
- AWS Cognito
- Authentik
- And many more...

## Configuration

### 1. Environment Variables

Set these environment variables in your `.env` file:

```env
# Select generic OIDC authentication
AUTH_METHOD=oidc_generic

# OIDC Provider Configuration
OIDC_ISSUER_URL=https://your-provider.com/realms/your-realm
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:5173/api/auth/callback

# Optional: Custom endpoints (auto-discovered if not set)
OIDC_AUTH_URL=https://your-provider.com/protocol/openid-connect/auth
OIDC_TOKEN_URL=https://your-provider.com/protocol/openid-connect/token
OIDC_USERINFO_URL=https://your-provider.com/protocol/openid-connect/userinfo

# Optional: Additional scopes
OIDC_SCOPES=openid profile email groups
```

### 2. Provider-Specific Examples

#### Keycloak
```env
AUTH_METHOD=oidc_generic
OIDC_ISSUER_URL=https://keycloak.example.com/realms/master
OIDC_CLIENT_ID=ggrequestz
OIDC_CLIENT_SECRET=your-secret
OIDC_REDIRECT_URI=https://ggrequestz.example.com/api/auth/callback
```

#### Auth0
```env
AUTH_METHOD=oidc_generic
OIDC_ISSUER_URL=https://your-tenant.auth0.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-secret
OIDC_REDIRECT_URI=https://ggrequestz.example.com/api/auth/callback
```

#### Okta
```env
AUTH_METHOD=oidc_generic
OIDC_ISSUER_URL=https://your-domain.okta.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-secret
OIDC_REDIRECT_URI=https://ggrequestz.example.com/api/auth/callback
```

#### Azure AD
```env
AUTH_METHOD=oidc_generic
OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant-id}/v2.0
OIDC_CLIENT_ID=your-app-id
OIDC_CLIENT_SECRET=your-secret
OIDC_REDIRECT_URI=https://ggrequestz.example.com/api/auth/callback
```

## Provider Configuration

### 1. Create Application/Client

In your OIDC provider, create a new application/client with:

- **Client Type**: Confidential/Web Application
- **Grant Types**: Authorization Code
- **Redirect URIs**: 
  - Development: `http://localhost:5173/api/auth/callback`
  - Production: `https://your-domain.com/api/auth/callback`

### 2. Configure Scopes

Ensure these scopes are available:
- `openid` (required)
- `profile` (recommended)
- `email` (recommended)
- `groups` (optional, for role-based access)

### 3. User Attributes/Claims

GG Requestz expects these standard claims:
- `sub` - User identifier
- `email` - User email address
- `name` or `preferred_username` - Display name
- `groups` - User groups (optional)

### 4. Admin Role Mapping

To grant admin access, configure one of:
- Add user to a group named `admin` or `ggrequestz-admin`
- Add custom claim `ggrequestz_role: admin`
- Configure role mapping in provider

## Testing Configuration

### 1. Verify Discovery Endpoint

Test that your issuer URL is correct:
```bash
curl https://your-provider.com/.well-known/openid-configuration
```

### 2. Test Authentication Flow

1. Navigate to GG Requestz login page
2. Click "Login with SSO"
3. You should be redirected to your OIDC provider
4. After authentication, you'll be redirected back to GG Requestz

### 3. Troubleshooting

#### Common Issues

**"Invalid client" error**
- Verify `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`
- Check client configuration in provider

**"Invalid redirect URI" error**
- Ensure `OIDC_REDIRECT_URI` matches exactly in provider config
- Include both http (dev) and https (prod) URLs if needed

**"User not found" after login**
- Check that email claim is being sent
- Verify scope includes `email` and `profile`

**Cannot access admin features**
- Verify group membership or role claims
- Check `groups` claim is included in token

#### Debug Mode

Enable debug logging:
```env
DEBUG=oidc:*
NODE_ENV=development
```

Check logs for:
- Token contents
- User claims
- Group memberships

## Security Considerations

### Production Setup

1. **Always use HTTPS** in production
2. **Secure secrets** - Use environment variables or secret management
3. **Validate certificates** - Don't disable SSL verification
4. **Limit redirect URIs** - Only add necessary URLs
5. **Token rotation** - Configure refresh token rotation if available

### CORS Configuration

If hosting on different domain:
```env
CORS_ORIGINS=https://your-frontend.com
```

## Advanced Configuration

### Custom User Mapping

Create custom user mapping in `/src/lib/integrations/providers/oidc-generic.js`:

```javascript
mapUserData(tokenData) {
  return {
    id: tokenData.sub,
    email: tokenData.email || tokenData.upn,
    name: tokenData.name || tokenData.given_name,
    groups: tokenData.groups || tokenData.roles || [],
    isAdmin: this.checkAdminRole(tokenData)
  };
}
```

### Session Management

Configure session timeout:
```env
SESSION_TIMEOUT=3600000  # 1 hour in milliseconds
REFRESH_TOKEN_ENABLED=true
```

## Migration from Other Auth Methods

### From Authentik
Simply change:
```env
AUTH_METHOD=authentik
```
to:
```env
AUTH_METHOD=oidc_generic
```

### From Basic Auth
1. Keep basic auth as fallback:
```env
AUTH_METHOD=oidc_generic
BASIC_AUTH_ENABLED=true
```

2. Migrate users gradually
3. Disable basic auth when complete

## Support

For provider-specific issues, consult your OIDC provider's documentation.
For GG Requestz integration issues, check our [troubleshooting guide](TROUBLESHOOTING.md) or create an issue on GitHub.