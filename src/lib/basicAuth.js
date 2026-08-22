/**
 * Basic Authentication System
 * Fallback authentication for initial admin setup when Authentik is not available
 */

import bcrypt from "bcrypt";
import crypto from "crypto";
import { query } from "$lib/database.js";
import { generateId } from "$lib/utils.js";
import { assignAdminRole } from "$lib/userProfile.js";

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
    throw new Error("Password must be at least 8 characters long");
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
      "SELECT COUNT(*) as count FROM ggr_users WHERE is_admin = TRUE",
    );

    if (existingAdmins.rows[0].count > 0) {
      throw new Error("Admin user already exists");
    }

    // Validate inputs
    if (!username || username.length < 3) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (!email || !email.includes("@")) {
      throw new Error("Valid email address required");
    }

    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user in unified table
    const result = await query(
      `
      INSERT INTO ggr_users (
        username, email, name, preferred_username, password_hash, 
        is_admin, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, NOW())
      RETURNING id, username, email, created_at
    `,
      [username, email, username, username, passwordHash],
    );

    const admin = result.rows[0];

    // Assign the Administrator role to the new admin user
    const roleAssigned = await assignAdminRole(admin.id);
    if (!roleAssigned) {
      console.warn(
        "⚠️ Failed to assign Administrator role to initial admin user",
      );
    } else {
      console.log("✅ Administrator role assigned to initial admin user");
    }

    return admin;
  } catch (error) {
    console.error("❌ Failed to create initial admin:", error);
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
    const result = await query(
      `
      SELECT id, username, email, name, preferred_username, password_hash, is_active, is_admin
      FROM ggr_users
      WHERE (username = $1 OR email = $1) 
        AND is_active = TRUE 
        AND password_hash IS NOT NULL
    `,
      [usernameOrEmail],
    );

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
    await query("UPDATE ggr_users SET last_login = NOW() WHERE id = $1", [
      user.id,
    ]);

    // Return user data (without password hash)
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin,
      auth_type: "basic",
      sub: `basic_auth_${user.id}`, // Compatible with Authentik format
      name: user.name || user.username,
      preferred_username: user.preferred_username || user.username,
    };
  } catch (error) {
    console.error("❌ Basic auth error:", error);
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
      "SELECT COUNT(*) as count FROM ggr_users WHERE is_active = TRUE AND password_hash IS NOT NULL",
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
      "SELECT COUNT(*) as count FROM ggr_users WHERE is_admin = TRUE AND is_active = TRUE",
    );

    const totalAdmins = parseInt(adminResult.rows[0].count);
    return totalAdmins === 0;
  } catch (error) {
    console.error("❌ Error checking initial setup status:", error);
    // If we can't determine, assume setup is needed
    return true;
  }
}

/**
 * Signing key for basic-auth session tokens.
 *
 * Deliberately fails closed. These tokens carry `is_admin`, so an absent or
 * placeholder secret must stop the process rather than silently produce
 * forgeable admin credentials.
 *
 * @returns {Buffer} - HMAC key
 */
function getSigningKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret === "your-secret-key") {
    throw new Error(
      "SESSION_SECRET is not set (or is still the example value). It is required " +
        "to sign session tokens; refusing to issue unsigned credentials.",
    );
  }

  return Buffer.from(secret, "utf8");
}

/**
 * HMAC-SHA256 over the encoded payload.
 * @param {string} encodedPayload - base64url payload
 * @returns {string} - base64url signature
 */
function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(encodedPayload)
    .digest("base64url");
}

/**
 * Create a signed basic auth session token.
 *
 * Previously this was unsigned base64 JSON, "verified" by decoding it and
 * checking `exp`. Any unauthenticated client could mint themselves an admin
 * session with
 *   btoa('{"id":1,"is_admin":true,"auth_type":"basic","exp":9999999999999,...}')
 * and set it as the `basic_auth_session` cookie. Tokens are now HMAC-signed.
 *
 * Uses node:crypto rather than `jose` so verification stays synchronous:
 * `getBasicAuthUser()` is called synchronously from hooks and layout loads.
 */
export function createBasicAuthToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    auth_type: "basic",
    sub: `basic_auth_${user.id}`,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

/**
 * Verify and decode a basic auth token.
 *
 * Unsigned legacy tokens are rejected; that is the whole point of the change,
 * so existing basic-auth sessions are invalidated and users re-login once.
 */
export function verifyBasicAuthToken(token) {
  try {
    const [encodedPayload, signature] = String(token).split(".");

    if (!encodedPayload || !signature) {
      return null; // Legacy unsigned token, or malformed
    }

    const expected = signPayload(encodedPayload);
    const providedBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return null; // Bad signature
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    // Check expiration
    if (payload.exp < Date.now()) {
      return null; // Token expired
    }

    // Check auth type
    if (payload.auth_type !== "basic") {
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
    console.error("❌ Failed to list basic auth users:", error);
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

    const allowedFields = [
      "username",
      "email",
      "name",
      "preferred_username",
      "is_active",
      "is_admin",
    ];
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
      throw new Error("No valid fields to update");
    }

    setClause.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await query(
      `
      UPDATE ggr_users
      SET ${setClause.join(", ")}
      WHERE id = $${paramIndex} AND password_hash IS NOT NULL
      RETURNING id, username, email, name, preferred_username, is_active, is_admin, updated_at
    `,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("User not found");
    }

    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to update basic auth user:", error);
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
    user_id: payload.id, // Add user_id for consistency with Authentik auth
    username: payload.username,
    email: payload.email,
    name: payload.username,
    preferred_username: payload.username,
    sub: payload.sub,
    is_admin: payload.is_admin,
    auth_type: "basic",
  };
}

/**
 * Alias for authenticateBasicUser (for compatibility)
 */
export const authenticateUser = authenticateBasicUser;
