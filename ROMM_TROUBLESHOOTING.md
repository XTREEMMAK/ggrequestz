# ROMM Integration Troubleshooting

## Current Issue: 403 Forbidden API Access

Your ROMM authentication is working correctly, but the user account lacks the necessary permissions to access API endpoints.

### Root Cause

The JWT token received from ROMM contains empty scopes (`"scopes": ""`), which means your user account can log in but has no API access permissions.

### Diagnostic Evidence

```bash
# Authentication works ✅
curl -X POST https://gl.keyjaycompound.com/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=XTREEMMAK&password=ENIGNIX_3000"
# Returns: {"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires": 1800}

# But API access fails ❌
curl -H "Authorization: Bearer <token>" https://gl.keyjaycompound.com/api/platforms?size=1
# Returns: HTTP 403 {"detail":"Forbidden"}
```

## Solutions (Pick One)

### Option 1: Grant API Permissions to User Account (Recommended)

1. Log into your ROMM web interface as an administrator
2. Go to **Settings** → **Users**
3. Find your user account (`XTREEMMAK`)
4. Change the role from "Viewer" to "Editor" or "Admin"
5. Save the changes
6. The JWT tokens will now include the necessary scopes for API access

### Option 2: Use API Key Authentication

1. Log into your ROMM web interface as an administrator
2. Go to **Settings** → **API Keys**
3. Create a new API key with appropriate permissions
4. Update your `.env` file:

   ```env
   # Comment out username/password
   # ROMM_USERNAME=XTREEMMAK
   # ROMM_PASSWORD=ENIGNIX_3000

   # Add API key instead
   ROMM_API_KEY=your_generated_api_key_here
   ```

5. Restart your application

### Option 3: Check ROMM Configuration

If you are the ROMM administrator, check:

1. **Database user roles**: Ensure the user has proper permissions
2. **ROMM version**: Make sure you're running a compatible version
3. **Configuration**: Check ROMM settings for API access controls

## Testing the Fix

After applying one of the solutions above, test with:

```bash
# For username/password (after role upgrade)
npm run dev
# Check the console logs for JWT scopes in the browser dev tools

# For API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://gl.keyjaycompound.com/api/platforms?size=1
# Should return platform data instead of {"detail":"Forbidden"}
```

## Why This Happens

ROMM implements role-based access control where:

- **Viewer**: Can browse the web interface but cannot access API endpoints
- **Editor**: Can access API endpoints for read/write operations
- **Admin**: Full access to everything including user management

Your current user account is likely set to "Viewer" role, which explains why web login works but API calls fail.

## Next Steps

1. Apply one of the solutions above
2. Test the integration
3. If you continue having issues, check the ROMM logs for additional error details
4. Consider reaching out to the ROMM community for support if the problem persists

The application code is now enhanced to provide better error messages and diagnostics for this type of issue.
