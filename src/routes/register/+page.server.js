/**
 * Server-side logic for registration page
 * Checks if registration is enabled and redirects if not
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";

export async function load() {
  try {
    // Check if registration is enabled
    const settingResult = await query(
      "SELECT value FROM ggr_system_settings WHERE key = 'system.registration_enabled'",
    );

    const registrationEnabled =
      settingResult.rows.length > 0 && settingResult.rows[0].value === "true";

    if (!registrationEnabled) {
      // If registration is disabled, redirect to login
      throw redirect(302, "/login/basic?message=registration_disabled");
    }

    return {
      registrationEnabled: true,
    };
  } catch (error) {
    // If it's not a redirect error, log it and redirect to login
    if (error.status !== 302) {
      console.error("Error checking registration status:", error);
      throw redirect(302, "/login/basic?message=registration_error");
    }
    // Re-throw redirect errors
    throw error;
  }
}
