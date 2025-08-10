# Authentik Admin Setup Guide

This guide explains how to set up admin access for G.G Requestz when using Authentik authentication.

## Overview

G.G Requestz supports two methods for granting admin privileges with Authentik:

1. **Direct Database Flag** - Set `is_admin = TRUE` in the database
2. **Authentik Group Membership** - Add users to the `gg-requestz-admins` group in Authentik

## Method 1: Direct Database Flag (Immediate Setup)

If you need immediate admin access:

```sql
-- Replace 'your-email@example.com' with your actual email
UPDATE ggr_users SET is_admin = TRUE WHERE email = 'your-email@example.com';
```

Or use the provided script:
```bash
psql -h your-db-host -U postgres -d postgres -f grant-admin-access.sql
```

## Method 2: Authentik Group-Based Admin (Recommended)

### Step 1: Create Admin Group in Authentik

1. Login to your Authentik admin panel
2. Go to **Directory** → **Groups**
3. Click **Create Group**
4. Set the group name to: `gg-requestz-admins`
5. Add a description: "G.G Requestz Administrators"
6. Save the group

### Step 2: Add Users to Admin Group

1. Go to **Directory** → **Users**
2. Select the user you want to make an admin
3. Go to the **Groups** tab
4. Add them to the `gg-requestz-admins` group
5. Save changes

### Step 3: Update Application Scopes (If Needed)

Ensure your Authentik application includes group information:

1. Go to **Applications** → **Providers**
2. Find your G.G Requestz OAuth2/OIDC provider
3. Check that **Include claims in id_token** is enabled
4. Verify that the **groups** scope is included

### Step 4: Test Admin Access

1. Logout from G.G Requestz
2. Login again via Authentik
3. The system will automatically detect your group membership
4. You should now have admin access

## How It Works

### Automatic Group Sync

When you login via Authentik, the system:

1. **Checks Group Membership**: Looks for `gg-requestz-admins` in your Authentik groups
2. **Updates Database**: Sets `is_admin = TRUE/FALSE` based on group membership
3. **Grants Access**: Provides immediate admin access if group is present

### Real-Time Group Checking

The admin panel checks both:
- **Database Flag**: The stored `is_admin` value
- **Current Groups**: Live group membership from your JWT token

This means group changes in Authentik take effect immediately on next page load.

## Group Mapping

The system recognizes these Authentik groups:

| Authentik Group | Role | Admin Access |
|----------------|------|--------------|
| `gg-requestz-admins` | Admin | ✅ Full Access |
| `gg-requestz-managers` | Manager | ❌ Limited Access |
| `gg-requestz-users` | Viewer | ❌ Read Only |

## Troubleshooting

### Admin Access Denied

1. **Check Group Membership**:
   - Verify you're in the `gg-requestz-admins` group in Authentik
   - Check group name spelling (case sensitive)

2. **Check Database Flag**:
   ```sql
   SELECT email, is_admin FROM ggr_users WHERE email = 'your-email@example.com';
   ```

3. **Check JWT Groups**:
   - Visit `/api/debug/simple-admin-check` while logged in
   - Verify groups are included in the JWT token

### Groups Not Syncing

1. **Check Provider Configuration**:
   - Ensure groups scope is included
   - Verify "Include claims in id_token" is enabled

2. **Check Application Logs**:
   - Look for group sync messages in the console
   - Check for JWT token group information

3. **Force Re-login**:
   - Logout completely from both G.G Requestz and Authentik
   - Clear browser cookies
   - Login again

## Migration from Basic Auth

If you started with basic auth and want to migrate to Authentik:

1. **Keep Existing Admin**: Your current admin flag will be preserved
2. **Add to Authentik Group**: Also add yourself to `gg-requestz-admins` for consistency
3. **Switch Auth Method**: Change `AUTH_METHOD=authentik` in your `.env` file
4. **Test Access**: Login via Authentik to confirm admin access works

## Security Notes

- Group membership is checked on every admin page access
- Removing users from the admin group removes their access immediately
- Direct database flags override group membership (if both are present)
- Admin access logs are available in the application console

## Example Authentik Configuration

```yaml
# Example Authentik OAuth2 Provider Settings
name: gg-requestz
client_type: confidential
authorization_grant_type: authorization-code
include_claims_in_id_token: true
scopes:
  - openid
  - profile
  - email
  - groups
```

For questions or issues, check the application logs or create an issue in the repository.