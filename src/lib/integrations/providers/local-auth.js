/**
 * Local Authentication Provider
 * Handles traditional username/password authentication
 */

import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { query } from "../../database.js";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "fallback-secret-key",
);

/**
 * Authenticate user with local credentials
 */
export async function authenticate(credentials) {
  try {
    const { email, password } = credentials;

    if (!email || !password) {
      return {
        success: false,
        error: "Email and password are required",
      };
    }

    // Find user by email
    const result = await query(
      "SELECT * FROM ggr_users WHERE email = $1 AND is_active = true",
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    const user = result.rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    // Update last login
    await query(
      "UPDATE ggr_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id],
    );

    // Create session token
    const sessionToken = await createSessionToken(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        is_admin: user.is_admin,
      },
      sessionToken,
    };
  } catch (error) {
    console.error("Local authentication error:", error);
    return {
      success: false,
      error: "Authentication failed",
    };
  }
}

/**
 * Create user account with local authentication
 */
export async function createUser(userData) {
  try {
    const { email, password, name } = userData;

    if (!email || !password) {
      return {
        success: false,
        error: "Email and password are required",
      };
    }

    // Check if user already exists
    const existing = await query("SELECT id FROM ggr_users WHERE email = $1", [
      email.toLowerCase(),
    ]);

    if (existing.rows.length > 0) {
      return {
        success: false,
        error: "User already exists",
      };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate user ID
    const userId = generateUserId();

    // Create user
    const result = await query(
      `
      INSERT INTO ggr_users (
        id, email, name, password_hash, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
      RETURNING id, email, name, avatar, is_admin, created_at
    `,
      [userId, email.toLowerCase(), name || "", passwordHash],
    );

    const user = result.rows[0];

    // Assign default user role
    await assignDefaultRole(user.id);

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("User creation error:", error);
    return {
      success: false,
      error: "Failed to create user",
    };
  }
}

/**
 * Change user password
 */
export async function changePassword(userId, currentPassword, newPassword) {
  try {
    // Get current user
    const result = await query(
      "SELECT password_hash FROM ggr_users WHERE id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return { success: false, error: "User not found" };
    }

    const user = result.rows[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!passwordMatch) {
      return { success: false, error: "Current password is incorrect" };
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      "UPDATE ggr_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [newPasswordHash, userId],
    );

    return { success: true, message: "Password changed successfully" };
  } catch (error) {
    console.error("Password change error:", error);
    return { success: false, error: "Failed to change password" };
  }
}

/**
 * Reset password (for admin or forgot password flow)
 */
export async function resetPassword(email, newPassword) {
  try {
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    const result = await query(
      "UPDATE ggr_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id",
      [passwordHash, email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return { success: false, error: "User not found" };
    }

    return { success: true, message: "Password reset successfully" };
  } catch (error) {
    console.error("Password reset error:", error);
    return { success: false, error: "Failed to reset password" };
  }
}

/**
 * Verify session token
 */
export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secret);

    // Verify user is still active
    const result = await query(
      "SELECT id, email, name, avatar, is_admin, is_active FROM ggr_users WHERE id = $1 AND is_active = true",
      [payload.user_id],
    );

    if (result.rows.length === 0) {
      return null; // User no longer exists or inactive
    }

    return {
      ...payload,
      user: result.rows[0],
    };
  } catch (error) {
    console.error("Session verification failed:", error);
    return null;
  }
}

/**
 * Create session token
 */
async function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.id,
    user_id: user.id,
    email: user.email,
    name: user.name,
    is_admin: user.is_admin,
    provider: "local_auth",
  };

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 24 * 60 * 60) // 24 hours
    .sign(secret);
}

/**
 * Logout (local auth just invalidates token client-side)
 */
export async function logout(token) {
  // For local auth, logout is handled client-side by removing token
  // Could implement token blacklist here if needed
  return { success: true, message: "Logged out successfully" };
}

/**
 * Assign default role to new user
 */
async function assignDefaultRole(userId) {
  try {
    // Get default user role
    const roleResult = await query("SELECT id FROM ggr_roles WHERE name = $1", [
      "user",
    ]);

    if (roleResult.rows.length > 0) {
      const roleId = roleResult.rows[0].id;

      await query(
        "INSERT INTO ggr_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, roleId],
      );
    }
  } catch (error) {
    console.error("Failed to assign default role:", error);
  }
}

/**
 * Generate unique user ID
 */
function generateUserId() {
  return "local_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}
