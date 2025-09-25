/**
 * Basic authentication user registration endpoint
 * Allows new users to register when registration is enabled in settings
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { hashPassword } from "$lib/basicAuth.js";
import { generateId } from "$lib/utils.js";

export async function POST({ request }) {
  try {
    // Check if registration is enabled
    const settingResult = await query(
      "SELECT value FROM ggr_system_settings WHERE key = 'system.registration_enabled'",
    );

    const registrationEnabled =
      settingResult.rows.length > 0 && settingResult.rows[0].value === "true";

    if (!registrationEnabled) {
      return json(
        {
          success: false,
          error: "User registration is currently disabled",
        },
        { status: 403 },
      );
    }

    // Parse request data
    const { username, email, password } = await request.json();

    // Validate required fields
    if (!username || !email || !password) {
      return json(
        {
          success: false,
          error: "Username, email, and password are required",
        },
        { status: 400 },
      );
    }

    // Validate username format (alphanumeric and underscores only, 3-50 chars)
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      return json(
        {
          success: false,
          error:
            "Username must be 3-50 characters and contain only letters, numbers, and underscores",
        },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return json(
        {
          success: false,
          error: "Please enter a valid email address",
        },
        { status: 400 },
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return json(
        {
          success: false,
          error: "Password must be at least 8 characters long",
        },
        { status: 400 },
      );
    }

    // Check if username already exists
    const usernameCheck = await query(
      "SELECT id FROM ggr_users WHERE username = $1",
      [username],
    );

    if (usernameCheck.rows.length > 0) {
      return json(
        {
          success: false,
          error: "Username is already taken",
        },
        { status: 409 },
      );
    }

    // Check if email already exists
    const emailCheck = await query(
      "SELECT id FROM ggr_users WHERE email = $1",
      [email],
    );

    if (emailCheck.rows.length > 0) {
      return json(
        {
          success: false,
          error: "Email address is already registered",
        },
        { status: 409 },
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create the user
    const result = await query(
      `
      INSERT INTO ggr_users (
        username, email, password_hash, name, is_admin, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, FALSE, TRUE, NOW(), NOW())
      RETURNING id, username, email, name, created_at
    `,
      [username, email, passwordHash, username],
    );

    const newUser = result.rows[0];

    // Log the registration for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          newUser.id,
          "user_registered",
          JSON.stringify({
            registration_method: "basic_auth",
            username: username,
            email: email,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log registration analytics:", analyticsError);
      // Don't fail the registration if analytics logging fails
    }

    return json(
      {
        success: true,
        message: "Account created successfully",
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          name: newUser.name,
          created_at: newUser.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ User registration error:", error);

    // Handle specific database errors
    if (error.code === "23505") {
      // Unique constraint violation
      return json(
        {
          success: false,
          error: "Username or email is already registered",
        },
        { status: 409 },
      );
    }

    return json(
      {
        success: false,
        error: "Failed to create account. Please try again.",
      },
      { status: 500 },
    );
  }
}
