/**
 * Profile page data loader
 */

import { redirect } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { getUserWatchlist, getUserRequests } from "$lib/userProfile.js";

export async function load({ parent, depends }) {
  // Add dependency for watchlist data invalidation
  depends("app:watchlist");
  const { user } = await parent();

  // Redirect to login if not authenticated
  if (!user) {
    throw redirect(302, "/login");
  }

  try {
    // Get user's local database ID
    let userResult;
    let localUserId;

    if (user.sub?.startsWith("basic_auth_")) {
      // For basic auth, extract ID from the user.sub format: basic_auth_123
      const basicAuthId = user.sub.replace("basic_auth_", "");
      userResult = await query(
        "SELECT id FROM ggr_users WHERE id = $1 AND password_hash IS NOT NULL",
        [parseInt(basicAuthId)],
      );
    } else {
      // For Authentik users
      userResult = await query(
        "SELECT id FROM ggr_users WHERE authentik_sub = $1",
        [user.sub],
      );
    }

    if (userResult.rows.length === 0) {
      console.error("Profile load: User not found in database");
      throw redirect(302, "/login");
    }

    localUserId = userResult.rows[0].id;

    // Fetch user's watchlist and requests in parallel
    const [userWatchlist, userRequests] = await Promise.all([
      getUserWatchlist(localUserId).catch((err) => {
        console.error("Profile load: Failed to get watchlist:", err);
        return [];
      }),
      getUserRequests(localUserId).catch((err) => {
        console.error("Profile load: Failed to get requests:", err);
        return [];
      }),
    ]);

    return {
      userWatchlist,
      userRequests,
    };
  } catch (error) {
    console.error("Profile load error:", error);
    // If it's already a redirect, re-throw it
    if (error.status === 302) {
      throw error;
    }

    return {
      userWatchlist: [],
      userRequests: [],
    };
  }
}
