/**
 * Unified authentication functions for consolidated user table
 * This replaces the separate basic auth system after consolidation
 */

import { query } from './database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.SESSION_SECRET || 'your-secret-key';
const TOKEN_EXPIRES_IN = '3d';

/**
 * Authenticate user with username/password (basic auth)
 * Works with consolidated ggr_users table
 */
export async function authenticateUser(usernameOrEmail, password) {
  try {
    // Look up user in consolidated ggr_users table
    const result = await query(`
      SELECT id, username, email, name, preferred_username, password_hash, 
             is_active, is_admin, authentik_sub
      FROM ggr_users
      WHERE (username = $1 OR email = $1) 
        AND is_active = TRUE 
        AND password_hash IS NOT NULL
    `, [usernameOrEmail]);

    if (result.rows.length === 0) {
      return null; // User not found or not a basic auth user
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
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
      name: user.name || user.username,
      preferred_username: user.preferred_username || user.username,
      is_admin: user.is_admin,
      auth_type: 'basic',
      user_id: user.email, // Use email as consistent identifier
    };
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return null;
  }
}

/**
 * Create JWT token for authenticated user
 */
export function createAuthToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    user_id: user.email, // Consistent identifier
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

/**
 * Verify JWT token and return user data
 */
export function verifyAuthToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return {
      id: payload.id,
      username: payload.username,
      email: payload.email,
      name: payload.username,
      preferred_username: payload.username,
      is_admin: payload.is_admin,
      auth_type: 'basic',
      user_id: payload.user_id || payload.email,
    };
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return null;
  }
}

/**
 * Get user from session token (replaces getBasicAuthUser)
 */
export function getUserFromToken(sessionToken) {
  if (!sessionToken) {
    return null;
  }
  
  return verifyAuthToken(sessionToken);
}

/**
 * Create a new basic auth user in consolidated table
 */
export async function createUser(userData) {
  try {
    const { username, email, password, is_admin = false } = userData;
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Insert user
    const result = await query(`
      INSERT INTO ggr_users (
        username, email, name, preferred_username, password_hash, 
        is_active, is_admin, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, username, email, name, is_admin
    `, [
      username,
      email, 
      username, // Use username as display name
      username, // Use username as preferred_username
      password_hash,
      true, // is_active
      is_admin
    ]);
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Failed to create user:', error);
    throw error;
  }
}

/**
 * Check if any admin users exist (for initial setup)
 */
export async function hasAdminUsers() {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM ggr_users WHERE is_admin = TRUE AND is_active = TRUE'
    );
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('❌ Failed to check admin users:', error);
    return false;
  }
}