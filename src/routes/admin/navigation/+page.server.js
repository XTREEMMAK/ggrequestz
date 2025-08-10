/**
 * Admin custom navigation management - server loader
 */

import { redirect } from "@sveltejs/kit";
import { customNavigation, query } from "$lib/database.js";

export async function load({ parent }) {
  const { userPermissions } = await parent();

  // Verify navigation management permissions
  if (!userPermissions.includes("navigation.manage")) {
    throw redirect(302, "/?error=unauthorized");
  }

  try {
    // Get all custom navigation items
    const navItems = await customNavigation.getAll();

    // Get available roles for role-based visibility
    const rolesResult = await query(
      "SELECT id, name, display_name FROM ggr_roles WHERE is_active = true ORDER BY display_name"
    );
    const availableRoles = rolesResult.rows;

    return {
      navItems,
      availableRoles,
    };
  } catch (error) {
    console.error("Failed to load navigation items:", error);
    return {
      navItems: [],
      availableRoles: [],
    };
  }
}
