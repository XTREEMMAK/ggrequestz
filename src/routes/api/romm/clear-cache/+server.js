/**
 * API endpoint to clear ROMM cache and session data
 */

import { json } from "@sveltejs/kit";
import { clearRommSession } from "$lib/romm.server.js";
import { verifySessionToken } from "$lib/auth.server.js";
import { userHasPermission } from "$lib/userProfile.js";
import { query } from "$lib/database.js";

export async function POST({ cookies }) {
  try {
    // Verify authentication
    const sessionCookie = cookies.get("session");
    if (!sessionCookie) {
      return json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const user = await verifySessionToken(sessionCookie);
    if (!user) {
      return json(
        { success: false, error: "Invalid session" },
        { status: 401 },
      );
    }

    // Get user's local ID and check admin permissions
    const userResult = await query(
      "SELECT id FROM ggr_users WHERE authentik_sub = $1",
      [user.sub],
    );

    if (userResult.rows.length === 0) {
      return json({ success: false, error: "User not found" }, { status: 404 });
    }

    const localUserId = userResult.rows[0].id;
    const hasAdminPermission = await userHasPermission(
      localUserId,
      "admin.panel",
    );

    if (!hasAdminPermission) {
      return json(
        { success: false, error: "Admin permissions required" },
        { status: 403 },
      );
    }

    // Clear ROMM session token to force re-authentication
    clearRommSession();

    // Clear any ROMM-related cached data from database
    // This removes games that are marked as ROMM games from cache
    const clearResult = await query(`
      DELETE FROM ggr_games_cache 
      WHERE metadata->>'is_romm_game' = 'true'
      OR metadata->>'romm_id' IS NOT NULL
    `);

    const clearedCount = clearResult.rowCount || 0;

    return json({
      success: true,
      message: `ROMM cache cleared successfully. ${clearedCount} cached entries removed.`,
      cleared_entries: clearedCount,
    });
  } catch (error) {
    console.error("❌ ROMM cache clear error:", error);
    return json(
      {
        success: false,
        error: "Failed to clear ROMM cache",
      },
      { status: 500 },
    );
  }
}
