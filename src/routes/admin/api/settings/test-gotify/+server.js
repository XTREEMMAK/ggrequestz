/**
 * Admin API endpoint for testing Gotify connection
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { verifySessionToken } from "$lib/auth.server.js";
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
    if (user.sub?.startsWith("basic_auth_")) {
      const basicAuthId = user.sub.replace("basic_auth_", "");
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)],
      );
    } else {
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
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
    const { url, token } = await request.json();

    if (!url || !token) {
      return json(
        {
          success: false,
          error: "Missing Gotify URL or token",
        },
        { status: 400 },
      );
    }

    // Validate URL format
    let gotifyUrl;
    try {
      gotifyUrl = new URL(url);
      if (!["http:", "https:"].includes(gotifyUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (error) {
      return json(
        {
          success: false,
          error: "Invalid Gotify URL format",
        },
        { status: 400 },
      );
    }

    // Test the connection by sending a test message
    const testMessage = {
      title: "🧪 GameRequest Test Notification",
      message: `Test message from G.G Requestz admin panel.\n\n**Admin:** ${user.name || user.email}\n**Time:** ${new Date().toISOString()}`,
      priority: 2,
      extras: {
        "client::display": {
          contentType: "text/markdown",
        },
      },
    };

    const testUrl = `${gotifyUrl.toString().replace(/\/$/, "")}/message?token=${token}`;

    const response = await fetch(testUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testMessage),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Gotify API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result = await response.json();

    // Log the test for analytics
    try {
      await query(
        `
        INSERT INTO ggr_user_analytics (user_id, action, metadata)
        VALUES ($1, $2, $3)
      `,
        [
          localUserId,
          "admin_gotify_test",
          JSON.stringify({
            gotify_url: gotifyUrl.origin,
            success: true,
            message_id: result.id || null,
          }),
        ],
      );
    } catch (analyticsError) {
      console.warn("Failed to log analytics:", analyticsError);
    }
    console.log(
      `✅ Gotify test successful - Message ID: ${result.id || "unknown"}`,
    );

    return json({
      success: true,
      message: "Test notification sent successfully",
      gotify_message_id: result.id || null,
    });
  } catch (error) {
    console.error("❌ Gotify test error:", error);

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
                "admin_gotify_test",
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
    let errorMessage = "Failed to connect to Gotify";

    if (error.name === "TimeoutError") {
      errorMessage = "Connection timed out - check your Gotify URL";
    } else if (error.message.includes("404")) {
      errorMessage = "Gotify endpoint not found - check your URL";
    } else if (error.message.includes("401") || error.message.includes("403")) {
      errorMessage = "Authentication failed - check your token";
    } else if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("ECONNREFUSED")
    ) {
      errorMessage =
        "Cannot reach Gotify server - check your URL and network connection";
    } else if (error.message.includes("Invalid protocol")) {
      errorMessage = "Invalid URL protocol - use http:// or https://";
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
