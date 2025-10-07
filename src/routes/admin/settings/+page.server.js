/**
 * Admin settings page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { getGlobalFilters } from "$lib/globalFilters.js";
import { getAvailableGenres } from "$lib/genreFiltering.js";

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

    // Load global content filters
    const globalFilters = await getGlobalFilters();

    // Load available genres for filter selection
    const availableGenres = await getAvailableGenres();

    return {
      settings,
      globalFilters,
      availableGenres,
    };
  } catch (error) {
    console.error("Settings page load error:", error);
    return {
      settings: {},
      globalFilters: {},
      availableGenres: [],
    };
  }
}
