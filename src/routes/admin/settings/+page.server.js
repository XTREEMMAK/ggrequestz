/**
 * Admin settings page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load({ parent }) {
  const { userPermissions } = await parent();

  // Check permission
  if (!userPermissions.includes("system.settings")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    // Get all system settings
    const settingsResult = await query(
      "SELECT key, value, description FROM ggr_system_settings ORDER BY category, key",
    );

    // Convert to key-value object
    const settings = {};
    settingsResult.rows.forEach((row) => {
      settings[row.key] = row.value;
    });

    return {
      settings,
    };
  } catch (error) {
    console.error("Settings page load error:", error);
    return {
      settings: {},
    };
  }
}
