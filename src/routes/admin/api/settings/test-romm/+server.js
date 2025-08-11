/**
 * Admin API endpoint for testing ROMM connection
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";
import { getBasicAuthUser } from "$lib/basicAuth.js";

export async function POST({ request, cookies }) {
  try {
    // Verify authentication - support both auth types
    const sessionCookie = cookies.get("session");
    const basicAuthSessionCookie = cookies.get("basic_auth_session");
    
    if (!sessionCookie && !basicAuthSessionCookie) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    let user = null;
    if (sessionCookie) {
      user = await verifySessionToken(sessionCookie);
    } else if (basicAuthSessionCookie) {
      user = getBasicAuthUser(basicAuthSessionCookie);
    }
    
    if (!user) {
      return json(
        { success: false, error: "Invalid session" },
        { status: 401 },
      );
    }

    // Get user's local ID - support both basic auth and Authentik users
    let userResult;
    if (user.sub?.startsWith('basic_auth_')) {
      const basicAuthId = user.sub.replace('basic_auth_', '');
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)]
      );
    } else {
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub]
      );
    }

    if (userResult.rows.length === 0) {
      return json({ success: false, error: "User not found" }, { status: 404 });
    }

    const localUserId = userResult.rows[0].id;

    // Check permissions
    const hasPermission = await userHasPermission(
      localUserId,
      "system.settings",
    );
    if (!hasPermission) {
      return json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Parse request data
    const { server_url, username, password } = await request.json();

    if (!server_url || !username || !password) {
      return json(
        {
          success: false,
          error: "Missing ROMM server URL, username, or password",
        },
        { status: 400 },
      );
    }

    // Validate URL format
    let rommUrl;
    try {
      rommUrl = new URL(server_url);
      if (!["http:", "https:"].includes(rommUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (error) {
      return json(
        {
          success: false,
          error: "Invalid ROMM server URL format",
        },
        { status: 400 },
      );
    }

    // Test the connection by trying to authenticate and get basic info

    // Step 1: Try to authenticate with ROMM
    const authUrl = `${rommUrl.toString().replace(/\/$/, "")}/api/token`;
    
    const authResponse = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        password: password,
      }),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text().catch(() => "Unknown error");
      throw new Error(
        `ROMM authentication failed: ${authResponse.status} ${authResponse.statusText} - ${errorText}`,
      );
    }

    const authResult = await authResponse.json();
    const token = authResult.access_token;

    if (!token) {
      throw new Error("No access token received from ROMM");
    }

    // Step 2: Try to get basic info about the ROMM instance
    const gamesUrl = `${rommUrl.toString().replace(/\/$/, "")}/api/roms?limit=1`;
    
    const gamesResponse = await fetch(gamesUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!gamesResponse.ok) {
      const errorText = await gamesResponse.text().catch(() => "Unknown error");
      throw new Error(
        `ROMM API error: ${gamesResponse.status} ${gamesResponse.statusText} - ${errorText}`,
      );
    }

    const gamesResult = await gamesResponse.json();
    const totalGames = gamesResult.total || 0;

    // Log the test for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "admin_romm_test",
          JSON.stringify({
            romm_url: rommUrl.origin,
            success: true,
            total_games: totalGames,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }
console.log(
      `✅ ROMM test successful - Connected to ${rommUrl.origin} with ${totalGames} games`,
    );

    return json({
      success: true,
      message: "ROMM connection successful",
      total_games: totalGames,
      server_info: {
        url: rommUrl.origin,
        authenticated: true,
      },
    });
  } catch (error) {
    console.error("❌ ROMM test error:", error);

    // Log the failed test for analytics
    try {
      const sessionCookie = cookies.get("session");
      if (sessionCookie) {
        const user = await verifySessionToken(sessionCookie);
        if (user) {
          const userResult = await query(
            "SELECT id FROM ggr_users WHERE authentik_sub = $1",
            [user.sub],
          );
          if (userResult.rows.length > 0) {
            await query(
              `
              INSERT INTO ggr_user_analytics (user_id, action, metadata)
              VALUES ($1, $2, $3)
            `,
              [
                userResult.rows[0].id,
                "admin_romm_test",
                JSON.stringify({
                  success: false,
                  error: error.message,
                }),
              ],
            );
          }
        }
      }
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }

    // Provide more specific error messages
    let errorMessage = "Failed to connect to ROMM";

    if (error.name === "TimeoutError") {
      errorMessage = "Connection timed out - check your ROMM server URL";
    } else if (error.message.includes("404")) {
      errorMessage = "ROMM API endpoint not found - check your server URL";
    } else if (error.message.includes("401") || error.message.includes("403")) {
      errorMessage = "Authentication failed - check your username and password";
    } else if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage =
        "Cannot reach ROMM server - check your URL and network connection";
    } else if (error.message.includes("Invalid protocol")) {
      errorMessage = "Invalid URL protocol - use http:// or https://";
    } else if (error.message.includes("authentication failed")) {
      errorMessage = "Invalid username or password for ROMM server";
    }

    return json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}