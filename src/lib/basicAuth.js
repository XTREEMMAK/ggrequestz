/**
 * Basic Authentication System
 * Fallback authentication for initial admin setup when Authentik is not available
 */

import bcrypt from 'bcrypt';
import { query } from '$lib/database.js';
import { generateId } from '$lib/utils.js';
import { assignAdminRole } from '$lib/userProfile.js';

const SALT_ROUNDS = 12;

/**
 * Ensure the users table exists (unified table)
 * This is now handled by migrations, kept for compatibility
 */
export async function ensureBasicAuthTable() {
  // The unified ggr_users table is created in migrations
  // This function is kept for backward compatibility
  return true;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Create the initial admin user if none exists
 */
export async function createInitialAdmin(username, email, password) {
  try {
    // Ensure table exists
    await ensureBasicAuthTable();

    // Check if any admin users exist in unified table
    const existingAdmins = await query(
      'SELECT COUNT(*) as count FROM ggr_users WHERE is_admin = TRUE'
    );

    if (existingAdmins.rows[0].count > 0) {
      throw new Error('Admin user already exists');
    }

    // Validate inputs
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }

    if (!email || !email.includes('@')) {
      throw new Error('Valid email address required');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user in unified table
    const result = await query(`
      INSERT INTO ggr_users (
        username, email, name, preferred_username, password_hash, 
        is_admin, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, NOW())
      RETURNING id, username, email, created_at
    `, [username, email, username, username, passwordHash]);

    const admin = result.rows[0];

    // Assign the Administrator role to the new admin user
    const roleAssigned = await assignAdminRole(admin.id);
    if (!roleAssigned) {
      console.warn('⚠️ Failed to assign Administrator role to initial admin user');
    } else {
      console.log('✅ Administrator role assigned to initial admin user');
    }

    return admin;
  } catch (error) {
    console.error('❌ Failed to create initial admin:', error);
    throw error;
  }
}

/**
 * Authenticate a user with basic auth
 */
export async function authenticateBasicUser(usernameOrEmail, password) {
  try {
    // First ensure the basic auth table exists
    await ensureBasicAuthTable();
    
    // Find user by username or email in unified table
    const result = await query(`
      SELECT id, username, email, name, preferred_username, password_hash, is_active, is_admin
      FROM ggr_users
      WHERE (username = $1 OR email = $1) 
        AND is_active = TRUE 
        AND password_hash IS NOT NULL
    `, [usernameOrEmail]);

    if (result.rows.length === 0) {
      return null; // User not found
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return null; // Invalid password
    }

    // Update last login
    await query(
      'UPDATE ggr_users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Return user data (without password hash)
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin,
      auth_type: 'basic',
      sub: `basic_auth_${user.id}`, // Compatible with Authentik format
      name: user.name || user.username,
      preferred_username: user.preferred_username || user.username,
    };
  } catch (error) {
    console.error('❌ Basic auth error:', error);
    return null;
  }
}

/**
 * Check if basic auth is enabled (has any users)
 */
export async function isBasicAuthEnabled() {
  try {
    // First ensure the basic auth table exists
    await ensureBasicAuthTable();
    
    const result = await query(
      'SELECT COUNT(*) as count FROM ggr_users WHERE is_active = TRUE AND password_hash IS NOT NULL'
    );
    return result.rows[0].count > 0;
  } catch (error) {
    // If table doesn't exist, basic auth is not enabled
    return false;
  }
}

/**
 * Check if system needs initial setup (no admin users exist)
 */
export async function needsInitialSetup() {
  try {
    // First ensure the basic auth table exists
    await ensureBasicAuthTable();

    // Check for any admin users in unified table
    const adminResult = await query(
      'SELECT COUNT(*) as count FROM ggr_users WHERE is_admin = TRUE AND is_active = TRUE'
    );

    const totalAdmins = parseInt(adminResult.rows[0].count);
    return totalAdmins === 0;
  } catch (error) {
    console.error('❌ Error checking initial setup status:', error);
    // If we can't determine, assume setup is needed
    return true;
  }
}

/**
 * Create a basic auth session token (simple JWT alternative)
 */
export function createBasicAuthToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    auth_type: 'basic',
    sub: `basic_auth_${user.id}`,
    iat: Date.now(),
    exp: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
  };

  // Simple token encoding (in production, use proper JWT)
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Verify and decode a basic auth token
 */
export function verifyBasicAuthToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    
    // Check expiration
    if (payload.exp < Date.now()) {
      return null; // Token expired
    }

    // Check auth type
    if (payload.auth_type !== 'basic') {
      return null; // Wrong token type
    }

    return payload;
  } catch (error) {
    return null; // Invalid token
  }
}

/**
 * List all basic auth users (admin only)
 */
export async function listBasicAuthUsers() {
  try {
    // First ensure the basic auth table exists
    await ensureBasicAuthTable();
    
    const result = await query(`
      SELECT id, username, email, name, preferred_username, is_active, is_admin, created_at, last_login
      FROM ggr_users
      WHERE password_hash IS NOT NULL
      ORDER BY created_at DESC
    `);

    return result.rows;
  } catch (error) {
    console.error('❌ Failed to list basic auth users:', error);
    throw error;
  }
}

/**
 * Update basic auth user
 */
export async function updateBasicAuthUser(userId, updates) {
  try {
    // First ensure the basic auth table exists
    await ensureBasicAuthTable();
    
    const allowedFields = ['username', 'email', 'name', 'preferred_username', 'is_active', 'is_admin'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClause.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await query(`
      UPDATE ggr_users
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex} AND password_hash IS NOT NULL
      RETURNING id, username, email, name, preferred_username, is_active, is_admin, updated_at
    `, values);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  } catch (error) {
    console.error('❌ Failed to update basic auth user:', error);
    throw error;
  }
}

/**
 * Get basic auth user from session token
 */
export function getBasicAuthUser(sessionToken) {
  if (!sessionToken) {
    return null;
  }
  
  // Try to verify the token
  const payload = verifyBasicAuthToken(sessionToken);
  if (!payload) {
    return null;
  }
  
  return {
    id: payload.id,
    username: payload.username,
    email: payload.email,
    name: payload.username,
    preferred_username: payload.username,
    sub: payload.sub,
    is_admin: payload.is_admin,
    auth_type: 'basic'
  };
}

/**
 * Alias for authenticateBasicUser (for compatibility)
 */
export const authenticateUser = authenticateBasicUser;