/**
 * Admission decisions for incoming requests.
 *
 * Kept separate from request status transitions: this module answers "should we
 * accept this request at all", not "what happens when its status changes".
 */

import { query } from "$lib/database.js";

// A request still in play. A rejected, cancelled or fulfilled request must not
// block a new one, so a failed fetch can be retried.
const OPEN_STATUSES = ["pending", "approved"];

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
