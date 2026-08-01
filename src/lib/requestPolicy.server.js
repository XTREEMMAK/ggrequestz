/**
 * Admission decisions for incoming requests.
 *
 * Kept separate from request status transitions: this module answers "should we
 * accept this request at all", not "what happens when its status changes".
 */

import { query } from "$lib/database.js";
import { userHasPermission } from "$lib/userProfile.js";

// A request still in play. A rejected, cancelled or fulfilled request must not
// block a new one, so a failed fetch can be retried.
const OPEN_STATUSES = ["pending", "approved"];

// One string, used twice on purpose: the per-role permission name and the
// global settings key are deliberately identical, so the two switches read as
// one concept in the admin UI and in migration 010, which seeds both. Kept in a
// single const so they cannot drift apart.
//
// As a setting it is stored by admin/settings/+page.svelte as the bare string
// "true"/"false", and is absent from the table until that form is first saved.
const AUTO_APPROVE_KEY = "request.auto_approve";

/**
 * Find an open request already covering the same game.
 *
 * Deliberately global rather than per user: two people wanting the same game is
 * one request, and the second is told so. Matching mirrors the partial unique
 * indexes in migration 009 exactly -- igdb_id when present, normalised title
 * when it is null -- so the pre-check and the backstop cannot disagree.
 *
 * @param {Object} params
 * @param {string|null} params.igdbId - IGDB id, may be null
 * @param {string} params.title - Request title
 * @param {string} params.requestType - game | update | fix
 * @returns {Promise<{id: string, status: string, user_name: string}|null>}
 */
export async function findOpenDuplicate({ igdbId, title, requestType }) {
  if (igdbId) {
    const result = await query(
      `SELECT id, status, user_name
         FROM ggr_game_requests
        WHERE igdb_id = $1 AND request_type = $2 AND status = ANY($3)
        LIMIT 1`,
      [igdbId, requestType, OPEN_STATUSES],
    );
    return result.rows[0] ?? null;
  }

  const result = await query(
    `SELECT id, status, user_name
       FROM ggr_game_requests
      WHERE igdb_id IS NULL
        AND lower(btrim(title)) = lower(btrim($1))
        AND request_type = $2
        AND status = ANY($3)
      LIMIT 1`,
    [title, requestType, OPEN_STATUSES],
  );
  return result.rows[0] ?? null;
}

/**
 * Whether this user's requests skip the approval queue.
 *
 * Two independent switches: a per-role permission for trusted users, and a
 * global setting meaning "everyone". userHasPermission already returns true for
 * any is_admin user, so administrators need no explicit grant.
 *
 * @param {string|number} userId - Local ggr_users id
 * @returns {Promise<boolean>}
 */
export async function mayAutoApprove(userId) {
  if (await userHasPermission(userId, AUTO_APPROVE_KEY)) {
    return true;
  }

  const result = await query(
    "SELECT value FROM ggr_system_settings WHERE key = $1",
    [AUTO_APPROVE_KEY],
  );

  return result.rows[0]?.value === "true";
}
