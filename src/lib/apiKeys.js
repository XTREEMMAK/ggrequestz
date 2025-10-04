/**
 * API Key management utilities
 * Provides secure API key generation, validation, and management
 */

import { browser } from "$app/environment";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { query } from "./database.js";

// Throw error if accidentally imported in browser
if (browser) {
  throw new Error(
    "apiKeys.js cannot be imported in browser - this is a server-only module",
  );
}

const API_KEY_PREFIX = "ggr_";
const API_KEY_LENGTH = 32; // 32 bytes = 64 hex characters
const BCRYPT_ROUNDS = 10;

/**
 * Generate a secure random API key
 * Format: ggr_<64 hex characters>
 * @returns {string} - Generated API key
 */
export function generateApiKey() {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  const keyBody = randomBytes.toString("hex");
  return `${API_KEY_PREFIX}${keyBody}`;
}

/**
 * Hash an API key using bcrypt
 * @param {string} apiKey - Plain text API key
 * @returns {Promise<string>} - Hashed API key
 */
export async function hashApiKey(apiKey) {
  return await bcrypt.hash(apiKey, BCRYPT_ROUNDS);
}

/**
 * Validate an API key against a hash
 * @param {string} apiKey - Plain text API key
 * @param {string} hash - Hashed API key
 * @returns {Promise<boolean>} - True if valid
 */
export async function validateApiKey(apiKey, hash) {
  return await bcrypt.compare(apiKey, hash);
}

/**
 * Extract the prefix from an API key for display and lookup
 * @param {string} apiKey - Full API key
 * @returns {string} - Key prefix (first 12 characters)
 */
export function getKeyPrefix(apiKey) {
  // Return prefix + first 8 chars of the key body for identification
  // e.g., "ggr_12345678"
  return apiKey.substring(0, 12);
}

/**
 * Create a new API key for a user
 * @param {number} userId - User ID
 * @param {string} name - Descriptive name for the key
 * @param {Array<string>} scopes - Array of permission scopes
 * @param {number} createdBy - User ID of creator
 * @param {Date|null} expiresAt - Optional expiration date
 * @returns {Promise<{key: string, id: number, prefix: string}>} - Created key info
 */
export async function createApiKey(
  userId,
  name,
  scopes = [],
  createdBy = null,
  expiresAt = null,
) {
  // Generate new key
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  // Insert into database
  const result = await query(
    `INSERT INTO ggr_api_keys
      (user_id, name, key_hash, key_prefix, scopes, created_by, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, key_prefix, created_at`,
    [
      userId,
      name,
      keyHash,
      keyPrefix,
      JSON.stringify(scopes),
      createdBy,
      expiresAt,
    ],
  );

  return {
    id: result.rows[0].id,
    key: apiKey, // Only returned once during creation
    prefix: result.rows[0].key_prefix,
    created_at: result.rows[0].created_at,
  };
}

/**
 * Get API key by prefix for fast lookup
 * @param {string} prefix - Key prefix
 * @returns {Promise<Object|null>} - API key record
 */
export async function getApiKeyByPrefix(prefix) {
  const result = await query(
    `SELECT ak.*, u.email, u.name as user_name, u.is_active as user_is_active
    FROM ggr_api_keys ak
    JOIN ggr_users u ON ak.user_id = u.id
    WHERE ak.key_prefix = $1 AND ak.is_active = true`,
    [prefix],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    key_hash: row.key_hash,
    key_prefix: row.key_prefix,
    scopes: row.scopes,
    is_active: row.is_active,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    user_email: row.email,
    user_name: row.user_name,
    user_is_active: row.user_is_active,
  };
}

/**
 * Authenticate and validate an API key
 * @param {string} apiKey - Full API key to validate
 * @returns {Promise<Object|null>} - User and key info if valid, null otherwise
 */
export async function authenticateApiKey(apiKey) {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const prefix = getKeyPrefix(apiKey);
  const keyRecord = await getApiKeyByPrefix(prefix);

  if (!keyRecord) {
    return null;
  }

  // Check if user is active
  if (!keyRecord.user_is_active) {
    return null;
  }

  // Check if key has expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return null;
  }

  // Validate the key hash
  const isValid = await validateApiKey(apiKey, keyRecord.key_hash);
  if (!isValid) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  updateLastUsed(keyRecord.id).catch((err) =>
    console.error("Failed to update API key last_used_at:", err),
  );

  return {
    user_id: keyRecord.user_id,
    user_email: keyRecord.user_email,
    user_name: keyRecord.user_name,
    api_key_id: keyRecord.id,
    api_key_name: keyRecord.name,
    scopes: keyRecord.scopes,
  };
}

/**
 * Update the last_used_at timestamp for an API key
 * @param {number} keyId - API key ID
 * @returns {Promise<void>}
 */
export async function updateLastUsed(keyId) {
  await query(
    `UPDATE ggr_api_keys
    SET last_used_at = NOW()
    WHERE id = $1`,
    [keyId],
  );
}

/**
 * Get all API keys for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} - Array of API keys (without hashes)
 */
export async function getApiKeysByUserId(userId) {
  const result = await query(
    `SELECT id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, updated_at
    FROM ggr_api_keys
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows;
}

/**
 * Revoke (deactivate) an API key
 * @param {number} keyId - API key ID
 * @param {number} userId - User ID (for authorization check)
 * @returns {Promise<boolean>} - True if revoked successfully
 */
export async function revokeApiKey(keyId, userId) {
  const result = await query(
    `UPDATE ggr_api_keys
    SET is_active = false, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING id`,
    [keyId, userId],
  );

  return result.rows.length > 0;
}

/**
 * Delete an API key permanently
 * @param {number} keyId - API key ID
 * @param {number} userId - User ID (for authorization check)
 * @returns {Promise<boolean>} - True if deleted successfully
 */
export async function deleteApiKey(keyId, userId) {
  const result = await query(
    `DELETE FROM ggr_api_keys
    WHERE id = $1 AND user_id = $2
    RETURNING id`,
    [keyId, userId],
  );

  return result.rows.length > 0;
}

/**
 * Update an API key's metadata (name, scopes, expiration)
 * @param {number} keyId - API key ID
 * @param {number} userId - User ID (for authorization check)
 * @param {Object} updates - Updates to apply
 * @returns {Promise<boolean>} - True if updated successfully
 */
export async function updateApiKey(keyId, userId, updates) {
  const allowedFields = ["name", "scopes", "expires_at"];
  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = $${paramIndex}`);
      values.push(key === "scopes" ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (updateFields.length === 0) {
    return false;
  }

  updateFields.push(`updated_at = NOW()`);
  values.push(keyId, userId);

  const result = await query(
    `UPDATE ggr_api_keys
    SET ${updateFields.join(", ")}
    WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
    RETURNING id`,
    values,
  );

  return result.rows.length > 0;
}

/**
 * Verify that an API key has the required scopes
 * @param {Array<string>} keyScopes - Scopes the API key has
 * @param {Array<string>} requiredScopes - Scopes required for the action
 * @returns {boolean} - True if key has all required scopes
 */
export function verifyScopes(keyScopes, requiredScopes) {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  if (!keyScopes || keyScopes.length === 0) {
    return false;
  }

  // Check if key has wildcard scope
  if (keyScopes.includes("*")) {
    return true;
  }

  // Check if all required scopes are present
  return requiredScopes.every((scope) => keyScopes.includes(scope));
}

/**
 * Available API scopes
 */
export const API_SCOPES = {
  // Read scopes
  GAMES_READ: "games:read",
  REQUESTS_READ: "requests:read",
  WATCHLIST_READ: "watchlist:read",
  USER_READ: "user:read",

  // Write scopes
  REQUESTS_WRITE: "requests:write",
  WATCHLIST_WRITE: "watchlist:write",
  USER_WRITE: "user:write",

  // Admin scopes
  ADMIN_READ: "admin:read",
  ADMIN_WRITE: "admin:write",

  // Wildcard
  ALL: "*",
};

/**
 * Get human-readable scope descriptions
 */
export const SCOPE_DESCRIPTIONS = {
  "games:read": "Read game information and search",
  "requests:read": "View game requests",
  "requests:write": "Create and manage game requests",
  "watchlist:read": "View watchlist",
  "watchlist:write": "Add and remove games from watchlist",
  "user:read": "Read user profile and preferences",
  "user:write": "Update user profile and preferences",
  "admin:read": "Read admin data and analytics",
  "admin:write": "Manage users, requests, and system settings",
  "*": "Full access to all API endpoints",
};
