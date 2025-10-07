/**
 * Extract database user ID from authenticated user object
 * Handles all auth types: API key, basic auth, Authentik/OIDC
 * @param {Object} user - Authenticated user object from getAuthenticatedUser()
 * @param {Function} query - Database query function
 * @returns {Promise<number>} - User's database ID
 * @throws {Error} - If user ID cannot be determined
 */
export async function getUserIdFromAuth(user, query) {
  if (!user) {
    throw new Error("No user provided");
  }

  let userId;

  if (user.auth_type === "api_key") {
    // API key users have user_id directly
    userId = user.user_id;
  } else if (
    user.auth_type === "basic" ||
    user.sub?.startsWith("basic_auth_")
  ) {
    // Basic auth users
    userId = user.id || parseInt(user.sub?.replace("basic_auth_", ""));
  } else if (user.sub) {
    // Authentik/OIDC users - need database lookup
    const userResult = await query(
      "SELECT id FROM ggr_users WHERE authentik_sub = $1",
      [user.sub],
    );
    if (userResult.rows.length === 0) {
      throw new Error("User not found in database");
    }
    userId = userResult.rows[0].id;
  } else {
    throw new Error("Unable to determine user ID from auth object");
  }

  if (!userId || isNaN(userId)) {
    throw new Error("Invalid user ID");
  }

  return parseInt(userId);
}
