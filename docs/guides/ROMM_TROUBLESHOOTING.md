# ROMM Integration Troubleshooting

## Common Issues and Solutions

### Issue 1: Basic Troubleshooting Steps

**Before diving into specific issues, try these basic steps:**

1. **Clear your browser cache first** - This resolves many caching-related issues
2. **Verify ROMM credentials** with this test command:
   ```bash
   curl -X POST <your-install-URL-or-IP-and-Port>/api/setup/check \
     -H "Content-Type: application/json" \
     -d '{"service": "romm_library"}'
   ```
   This should return `{"success":true}` if credentials are correct.
3. **Try with protocol** - Add `http://` or `https://` to your `ROMM_SERVER_URL` environment variable

### Issue 2: 403 Forbidden API Access

If ROMM authentication works but you get permission errors, the user account lacks API access permissions.

#### Root Cause

The JWT token received from ROMM contains empty scopes (`"scopes": ""`), which means your user account can log in but has no API access permissions.

#### Diagnostic Evidence

```bash
# Authentication works ✅
curl -X POST http://your-romm-server/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_USERNAME&password=YOUR_PASSWORD"
# Returns: {"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires": 1800}

# But API access fails ❌
curl -H "Authorization: Bearer <token>" http://your-romm-server/api/platforms?size=1
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

### Option 2: Check ROMM Configuration

If you are the ROMM administrator, check:

1. **Database user roles**: Ensure the user has proper permissions
2. **ROMM version**: Make sure you're running a compatible version
3. **Configuration**: Check ROMM settings for API access controls

## Testing the Fix

After applying the solution above, test with:

```bash
# For username/password (after role upgrade)
npm run dev
# Check the console logs for JWT scopes in the browser dev tools

# For API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://your-romm-server/api/platforms?size=1
# Should return platform data instead of {"detail":"Forbidden"}

# Test GG Requestz connection
curl -X POST http://your-ggrequestz-server/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "romm_library"}'
# Should return {"success": true}
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
