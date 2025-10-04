/**
 * Admin API Keys page data loader
 */

import { redirect } from "@sveltejs/kit";
import { apiKeys } from "$lib/database.js";
import { API_SCOPES, SCOPE_DESCRIPTIONS } from "$lib/apiKeys.js";

export async function load({ parent }) {
  const { user, userPermissions, localUserId } = await parent();

  // Check permission - only admins can manage API keys for now
  // TODO: Allow users to manage their own keys
  if (!userPermissions.includes("admin.panel")) {
    throw redirect(302, "/admin?error=permission_denied");
  }

  try {
    // Get all API keys for the current user
    // Admins can see all their keys
    const keys = await apiKeys.getByUserId(localUserId);

    // Format keys for display
    const formattedKeys = keys.map((key) => ({
      ...key,
      // Parse scopes if they're a string
      scopes:
        typeof key.scopes === "string" ? JSON.parse(key.scopes) : key.scopes,
      // Check if expired
      is_expired: key.expires_at && new Date(key.expires_at) < new Date(),
      // Format dates
      created_at_formatted: key.created_at
        ? new Date(key.created_at).toLocaleDateString()
        : "N/A",
      last_used_formatted: key.last_used_at
        ? new Date(key.last_used_at).toLocaleDateString()
        : "Never",
      expires_at_formatted: key.expires_at
        ? new Date(key.expires_at).toLocaleDateString()
        : "Never",
    }));

    return {
      keys: formattedKeys,
      availableScopes: API_SCOPES,
      scopeDescriptions: SCOPE_DESCRIPTIONS,
      user_id: localUserId,
    };
  } catch (error) {
    console.error("API Keys page load error:", error);
    return {
      keys: [],
      availableScopes: API_SCOPES,
      scopeDescriptions: SCOPE_DESCRIPTIONS,
      user_id: localUserId,
      error: "Failed to load API keys",
    };
  }
}
