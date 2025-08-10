# Custom Navigation Database Setup

## Required Database Changes

The custom navigation functionality uses a hierarchical role-based visibility system. Follow these steps to set up or migrate your database:

### 1. Run Complete Migration (Recommended)

The easiest way to set up the navigation system is to run the complete migration:

```sql
-- Run the hierarchical navigation migration
\i migrations/003_hierarchical_navigation.sql
```

### 2. Manual Setup (Alternative)

If you need to set up manually, execute these SQL commands:

```sql
-- Add hierarchical role-based visibility columns to ggr_custom_navigation table
ALTER TABLE ggr_custom_navigation 
ADD COLUMN IF NOT EXISTS visible_to_all BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visible_to_guests BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allowed_roles JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS minimum_role VARCHAR(20) DEFAULT 'viewer';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_custom_nav_minimum_role ON ggr_custom_navigation(minimum_role);

-- Update existing records to have default values
UPDATE ggr_custom_navigation 
SET visible_to_all = COALESCE(visible_to_all, true), 
    visible_to_guests = COALESCE(visible_to_guests, true), 
    allowed_roles = COALESCE(allowed_roles, '[]'::jsonb),
    minimum_role = COALESCE(minimum_role, 'viewer')
WHERE visible_to_all IS NULL OR minimum_role IS NULL;
```

### 2. Add Password Management Columns (for User Password Updates)

Execute the following SQL commands to add password management fields:

```sql
-- Add password management columns to ggr_users table (if they don't exist)
ALTER TABLE ggr_users 
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Update existing users with default values
UPDATE ggr_users 
SET password_changed_at = created_at,
    force_password_change = false
WHERE password_changed_at IS NULL;
```

### 3. Verify Changes

Check that the columns were added correctly:

```sql
-- Check ggr_custom_navigation structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'ggr_custom_navigation' 
ORDER BY ordinal_position;

-- Check ggr_users structure for password fields
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'ggr_users' 
AND column_name IN ('password_changed_at', 'force_password_change')
ORDER BY ordinal_position;
```

## How the Hierarchical Role-Based Navigation Works

### Column Explanations:

- **`visible_to_all`**: If true, all authenticated users can see this navigation link
- **`visible_to_guests`**: If true, unauthenticated (guest) users can also see this link  
- **`minimum_role`**: The minimum role level required to see this link (hierarchical system)
- **`allowed_roles`**: JSONB array maintained for backward compatibility (automatically generated from `minimum_role`)

### Role Hierarchy (highest to lowest):
1. **admin** - Full system access
2. **manager** - Management level access  
3. **moderator** - Content moderation access
4. **user** - Standard user access
5. **viewer** - Read-only access

### Visibility Logic:

1. If `visible_to_all = true`: All authenticated users see the link
2. If `visible_to_guests = true`: Unauthenticated users also see the link
3. If `visible_to_all = false`: Users with roles at or above the `minimum_role` level can see the link

**Hierarchical Access**: Setting `minimum_role` to "user" automatically allows "user", "moderator", "manager", and "admin" roles to see the link.

### Example Usage:

```sql
-- Create a navigation link visible to all users
INSERT INTO ggr_custom_navigation (name, href, icon, visible_to_all, visible_to_guests, minimum_role)
VALUES ('Documentation', 'https://docs.example.com', 'heroicons:book-open', true, true, 'viewer');

-- Create a navigation link visible only to admins
INSERT INTO ggr_custom_navigation (name, href, icon, visible_to_all, visible_to_guests, minimum_role)
VALUES ('Admin Panel', '/admin', 'heroicons:cog-6-tooth', false, false, 'admin');

-- Create a navigation link visible to managers and above (manager + admin)
INSERT INTO ggr_custom_navigation (name, href, icon, visible_to_all, visible_to_guests, minimum_role)
VALUES ('Reports', '/reports', 'heroicons:chart-bar', false, false, 'manager');

-- Create a navigation link visible to users and above (user + moderator + manager + admin)
INSERT INTO ggr_custom_navigation (name, href, icon, visible_to_all, visible_to_guests, minimum_role)
VALUES ('User Dashboard', '/dashboard', 'heroicons:home', false, false, 'user');
```

## Docker Integration

If you're using Docker, you can execute these commands by:

1. **Using Docker exec**:
   ```bash
   docker exec -it your-postgres-container psql -U postgres -d your_database
   ```

2. **Using a migration file**: Add the SQL commands to your database initialization script.

3. **Using the application**: The code is designed to gracefully handle missing columns, but adding them will unlock the full functionality.

## Testing the Setup

After applying the database changes:

1. Go to `/admin/navigation` in your admin panel
2. Create a new navigation item
3. Test the role-based visibility options
4. Verify that the navigation appears correctly based on user roles

The navigation system will automatically filter links based on the user's authentication status and assigned roles.