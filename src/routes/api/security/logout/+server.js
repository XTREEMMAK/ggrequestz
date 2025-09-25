/**
 * Security logout endpoint - logs out users due to security violations
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { sendGotifyNotification } from "$lib/gotify.js";

export async function POST({ cookies, locals, request }) {
  try {
    const body = await request.json();
    const { reason } = body;

    // Get user info for logging
    const { user } = locals;
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Log the security logout
    if (user) {
      await query(
        `
        INSERT INTO ggr_security_logs (
          event_type, user_id, username, ip_address, user_agent,
          details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
        [
          "security_logout",
          user.id,
          user.username || "unknown",
          ip,
          userAgent,
          JSON.stringify({
            reason: reason || "security_violation",
            forced_logout: true,
          }),
        ],
      );
    }

    // Send admin notification for security violation
    try {
      // Get security settings from database
      const settingsResult = await query(
        "SELECT value FROM ggr_system_settings WHERE key = $1",
        ["security_404_limit"],
      );

      let securitySettings = {
        enabled: true,
        notifyAdmin: true,
      };

      if (settingsResult.rows.length > 0) {
        securitySettings = JSON.parse(settingsResult.rows[0].value);
      }

      // Send notification if enabled
      if (securitySettings.enabled && securitySettings.notifyAdmin) {
        await sendGotifyNotification({
          title: "🚨 Security Alert: User Logged Out for 404 Violations",
          message: `User "${user?.username || "anonymous"}" (${ip}) has been automatically logged out due to excessive 404 attempts. Reason: ${reason || "security_violation"}`,
          priority: 8,
        });
      }
    } catch (notifyError) {
      console.warn(
        "Failed to send admin notification for security logout:",
        notifyError,
      );
    }

    // Clear all auth cookies
    cookies.delete("session", { path: "/" });
    cookies.delete("basic_auth_session", { path: "/" });

    return json({
      success: true,
      message: "User logged out due to security policy",
      redirectTo: "/login",
    });
  } catch (err) {
    console.error("Security logout error:", err);

    // Still clear cookies even if logging fails
    cookies.delete("session", { path: "/" });
    cookies.delete("basic_auth_session", { path: "/" });

    return json({
      success: true,
      message: "User logged out",
      redirectTo: "/login",
    });
  }
}
