/**
 * Refuse a request unless its caller is an administrator.
 *
 * For `+server.js` endpoints. A `+layout.server.js` load does not run for
 * endpoints, so an endpoint under /api is protected only by what it checks
 * itself; hooks.server.js establishes that a caller is signed in, never that
 * they may administer anything. API keys are additionally limited by scope in
 * hooks.server.js before they get here.
 *
 * Fails closed: a caller whose local account cannot be resolved is refused.
 */

import { error } from "@sveltejs/kit";
import { getAuthenticatedUser } from "$lib/auth.server.js";
import { getUserIdFromAuth } from "$lib/getUserId.js";
import { query } from "$lib/database.js";
import { userHasPermission } from "$lib/userProfile.js";

/**
 * @param {{cookies: import("@sveltejs/kit").Cookies, request: Request}} event
 * @returns {Promise<number>} - The administrator's local user id
 * @throws {import("@sveltejs/kit").HttpError} 401 when signed out, 403 otherwise
 */
export async function requireAdministrator({ cookies, request }) {
  const user = await getAuthenticatedUser(cookies, request);
  if (!user) {
    throw error(401, "Authentication required");
  }

  let localUserId;
  try {
    localUserId = await getUserIdFromAuth(user, query);
  } catch (lookupError) {
    console.warn(
      "Refusing an admin-only request: caller has no local account:",
      lookupError?.message || lookupError,
    );
    throw error(403, "Admin permissions required");
  }

  if (!(await userHasPermission(localUserId, "admin.panel"))) {
    throw error(403, "Admin permissions required");
  }

  return localUserId;
}
