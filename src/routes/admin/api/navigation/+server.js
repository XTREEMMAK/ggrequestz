/**
 * Admin API for managing custom navigation
 */

import { json, error } from "@sveltejs/kit";
import { customNavigation } from "$lib/database.js";
import { getSession } from "$lib/auth.js";
import { userHasPermission } from "$lib/userProfile.js";
import { query } from "$lib/database.js";

// Helper function to get user ID from session - support both auth types
async function getUserId(cookies) {
  // Try Authentik session first
  const sessionCookie = cookies.get("session");
  if (sessionCookie) {
    const user = await getSession(`session=${sessionCookie}`);
    if (user) {
      const result = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub]
      );
      return result.rows.length > 0 ? result.rows[0].id : null;
    }
  }
  
  // Try basic auth session
  const basicAuthSessionCookie = cookies.get("basic_auth_session");
  if (basicAuthSessionCookie) {
    try {
      const { getBasicAuthUser } = await import('$lib/basicAuth.js');
      const user = getBasicAuthUser(basicAuthSessionCookie);
      if (user && user.sub?.startsWith('basic_auth_')) {
        const basicAuthId = user.sub.replace('basic_auth_', '');
        const result = await query(
          "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
          [parseInt(basicAuthId)]
        );
        return result.rows.length > 0 ? result.rows[0].id : null;
      }
    } catch (error) {
      console.warn('Failed to get basic auth user:', error);
    }
  }
  
  return null;
}

// GET - Get all navigation items
export async function GET({ cookies }) {
  try {
    const userId = await getUserId(cookies);

    if (!userId || !(await userHasPermission(userId, "navigation.manage"))) {
      throw error(403, "Unauthorized");
    }

    const navItems = await customNavigation.getAll();

    return json({
      success: true,
      data: navItems,
    });
  } catch (err) {
    console.error("Navigation API GET error:", err);
    throw error(500, "Failed to fetch navigation items");
  }
}

// POST - Create new navigation item
export async function POST({ request, cookies }) {
  try {
    const userId = await getUserId(cookies);

    if (!userId || !(await userHasPermission(userId, "navigation.manage"))) {
      throw error(403, "Unauthorized");
    }

    const data = await request.json();

    // Validate required fields
    if (!data.name?.trim() || !data.href?.trim()) {
      throw error(400, "Name and URL are required");
    }

    // Convert minimum_role to allowed_roles for backward compatibility
    let allowedRoles = [];
    if (data.minimum_role && !data.visible_to_all) {
      // Define role hierarchy (highest to lowest)
      const roleHierarchy = ['admin', 'manager', 'moderator', 'user', 'viewer'];
      const minimumIndex = roleHierarchy.findIndex(role => role === data.minimum_role);
      if (minimumIndex !== -1) {
        // Include all roles from minimum level and above (higher hierarchy)
        allowedRoles = roleHierarchy.slice(0, minimumIndex + 1);
      }
    }

    const navData = {
      name: data.name.trim(),
      href: data.href.trim(),
      icon: data.icon || "heroicons:link",
      position: parseInt(data.position) || 100,
      is_external: Boolean(data.is_external),
      is_active: data.is_active !== false,
      visible_to_all: data.visible_to_all !== false, // Default to true
      visible_to_guests: data.visible_to_guests !== false, // Default to true
      allowed_roles: allowedRoles,
      minimum_role: data.minimum_role || 'viewer', // Store the minimum role for UI
      created_by: userId,
    };

    const result = await customNavigation.create(navData);

    if (result) {
      return json({
        success: true,
        data: result,
      });
    } else {
      throw error(500, "Failed to create navigation item");
    }
  } catch (err) {
    console.error("Navigation API POST error:", err);
    if (err.status) throw err;
    throw error(500, "Failed to create navigation item");
  }
}

// PUT - Update navigation item
export async function PUT({ request, cookies }) {
  try {
    const userId = await getUserId(cookies);

    if (!userId || !(await userHasPermission(userId, "navigation.manage"))) {
      throw error(403, "Unauthorized");
    }

    const data = await request.json();

    if (!data.id) {
      throw error(400, "Navigation item ID is required");
    }

    if (!data.name?.trim() || !data.href?.trim()) {
      throw error(400, "Name and URL are required");
    }

    // Convert minimum_role to allowed_roles for backward compatibility
    let allowedRoles = [];
    if (data.minimum_role && !data.visible_to_all) {
      // Define role hierarchy (highest to lowest)
      const roleHierarchy = ['admin', 'manager', 'moderator', 'user', 'viewer'];
      const minimumIndex = roleHierarchy.findIndex(role => role === data.minimum_role);
      if (minimumIndex !== -1) {
        // Include all roles from minimum level and above (higher hierarchy)
        allowedRoles = roleHierarchy.slice(0, minimumIndex + 1);
      }
    }

    const updates = {
      name: data.name.trim(),
      href: data.href.trim(),
      icon: data.icon || "heroicons:link",
      position: parseInt(data.position) || 100,
      is_external: Boolean(data.is_external),
      is_active: data.is_active !== false,
      visible_to_all: data.visible_to_all !== false, // Default to true
      visible_to_guests: data.visible_to_guests !== false, // Default to true
      allowed_roles: allowedRoles,
      minimum_role: data.minimum_role || 'viewer', // Store the minimum role for UI
    };

    const success = await customNavigation.update(data.id, updates);

    if (success) {
      return json({
        success: true,
        message: "Navigation item updated successfully",
      });
    } else {
      throw error(404, "Navigation item not found");
    }
  } catch (err) {
    console.error("Navigation API PUT error:", err);
    if (err.status) throw err;
    throw error(500, "Failed to update navigation item");
  }
}

// DELETE - Delete navigation item
export async function DELETE({ request, cookies }) {
  try {
    const userId = await getUserId(cookies);

    if (!userId || !(await userHasPermission(userId, "navigation.manage"))) {
      throw error(403, "Unauthorized");
    }

    const data = await request.json();

    if (!data.id) {
      throw error(400, "Navigation item ID is required");
    }

    const success = await customNavigation.delete(data.id);

    if (success) {
      return json({
        success: true,
        message: "Navigation item deleted successfully",
      });
    } else {
      throw error(404, "Navigation item not found");
    }
  } catch (err) {
    console.error("Navigation API DELETE error:", err);
    if (err.status) throw err;
    throw error(500, "Failed to delete navigation item");
  }
}
