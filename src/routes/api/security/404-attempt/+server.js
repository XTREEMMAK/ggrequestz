/**
 * API endpoint for tracking 404 attempts and security monitoring
 */

import { json, error } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { sendGotifyNotification } from "$lib/gotify.js";

// In-memory tracking for rate limiting (could be moved to Redis in production)
const attemptTracker = new Map();
const CLEANUP_INTERVAL = 60000; // Clean up old entries every minute

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of attemptTracker.entries()) {
    if (now - data.lastAttempt > 300000) {
      // Remove entries older than 5 minutes
      attemptTracker.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

function getClientIdentifier(request) {
  // Create a unique identifier based on IP and User-Agent
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Create a simple hash for privacy
  const identifier = `${ip}-${userAgent.slice(0, 50)}`;
  return Buffer.from(identifier).toString("base64").slice(0, 32);
}

export async function POST({ request, cookies, locals }) {
  try {
    const body = await request.json();
    const { path, userAgent, timestamp, attemptCount } = body;

    // Get client identifier for rate limiting
    const clientId = getClientIdentifier(request);
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Get user info if authenticated
    const { user } = locals;
    const userId = user?.id || null;
    const username = user?.username || "anonymous";

    // Update attempt tracking
    const now = Date.now();
    const existingData = attemptTracker.get(clientId) || {
      count: 0,
      firstAttempt: now,
      lastAttempt: now,
      paths: new Set(),
      warned: false,
    };

    existingData.count++;
    existingData.lastAttempt = now;
    existingData.paths.add(path);
    attemptTracker.set(clientId, existingData);

    // Check if we need to get security settings
    let securitySettings = {};
    try {
      const settingsResult = await query(
        "SELECT setting_value FROM ggr_settings WHERE setting_key = $1",
        ["security_404_limit"],
      );

      if (settingsResult.rows.length > 0) {
        securitySettings = JSON.parse(settingsResult.rows[0].setting_value);
      } else {
        // Default settings
        securitySettings = {
          enabled: true,
          maxAttempts: 5,
          timeWindow: 300, // 5 minutes
          logoutUser: true,
          notifyAdmin: true,
        };
      }
    } catch (err) {
      console.warn(
        "Could not load security settings, using defaults:",
        err.message,
      );
      securitySettings = {
        enabled: true,
        maxAttempts: 5,
        timeWindow: 300,
        logoutUser: true,
        notifyAdmin: true,
      };
    }

    // Log the attempt in database
    await query(
      `
      INSERT INTO ggr_security_logs (
        event_type, user_id, username, ip_address, user_agent,
        path, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
      [
        "404_attempt",
        userId,
        username,
        ip,
        userAgent,
        path,
        JSON.stringify({
          attemptCount: existingData.count,
          sessionAttempts: attemptCount,
          timeWindow: now - existingData.firstAttempt,
        }),
      ],
    );

    let shouldLogout = false;
    let shouldNotifyAdmin = false;

    // Check if user exceeded limits (only if security is enabled)
    if (
      securitySettings.enabled &&
      existingData.count >= securitySettings.maxAttempts
    ) {
      const timeWindow = (now - existingData.firstAttempt) / 1000; // Convert to seconds

      if (timeWindow <= securitySettings.timeWindow) {
        // User has exceeded limits within the time window
        shouldLogout = securitySettings.logoutUser && user;
        shouldNotifyAdmin = securitySettings.notifyAdmin;

        // Log security event
        await query(
          `
          INSERT INTO ggr_security_logs (
            event_type, user_id, username, ip_address, user_agent,
            path, details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `,
          [
            "security_violation",
            userId,
            username,
            ip,
            userAgent,
            path,
            JSON.stringify({
              violation_type: "excessive_404_attempts",
              attemptCount: existingData.count,
              timeWindow: timeWindow,
              uniquePaths: Array.from(existingData.paths),
              actionTaken: {
                logout: shouldLogout,
                notified: shouldNotifyAdmin,
              },
            }),
          ],
        );

        // Send admin notification (if enabled and not already warned)
        if (shouldNotifyAdmin && !existingData.warned) {
          try {
            await sendGotifyNotification({
              title: "🚨 Security Alert: Excessive 404 Attempts",
              message: `User "${username}" (${ip}) has made ${existingData.count} failed page requests in ${Math.round(timeWindow)} seconds. Paths: ${Array.from(existingData.paths).slice(0, 3).join(", ")}${existingData.paths.size > 3 ? "..." : ""}`,
              priority: 8,
            });
            existingData.warned = true;
            attemptTracker.set(clientId, existingData);
          } catch (notifyError) {
            console.error("Failed to send admin notification:", notifyError);
          }
        }
      }
    }

    return json({
      success: true,
      attempts: existingData.count,
      shouldLogout,
      warningThreshold: Math.max(1, securitySettings.maxAttempts - 2),
      maxAttempts: securitySettings.maxAttempts,
    });
  } catch (err) {
    console.error("404 attempt tracking error:", err);

    // Still return success to avoid breaking the error page
    return json({
      success: false,
      error: "Tracking failed",
    });
  }
}
