/**
 * The one place a request's status changes.
 *
 * Three routes used to update status and each did its own side effects:
 * admin/api/requests/update notified Gotify and invalidated cache,
 * bulk-update sent a bulk notification, and admin/requests/[id]/edit did
 * neither -- approving there notified nobody. Centralising the transition
 * makes "did we remember to notify?" a question that cannot be answered
 * differently per call site.
 */

import { query } from "$lib/database.js";
import {
  sendRequestStatusNotification,
  sendRequestCancelledDeletedNotification,
} from "$lib/gotify.js";
import { invalidateCache } from "$lib/cache.js";

/**
 * Change a request's status and perform everything that follows from it.
 *
 * The read and the write are one statement under FOR UPDATE, so two admins
 * approving at once cannot both observe the old status and both fire the
 * side effects.
 *
 * @param {Object} params
 * @param {string} params.id - Request UUID
 * @param {string} params.to - New status
 * @param {string|null} [params.actor] - Display name of whoever acted
 * @param {string|null} [params.adminNotes] - Notes to store, null keeps existing
 * @returns {Promise<{row: Object|null, from: string|null, to: string, changed: boolean}>}
 */
export async function applyRequestStatusChange({
  id,
  to,
  actor = null,
  adminNotes = null,
}) {
  const result = await query(
    `WITH previous AS (
         SELECT id, status FROM ggr_game_requests WHERE id = $1 FOR UPDATE
     )
     UPDATE ggr_game_requests r
        SET status = $2,
            admin_notes = COALESCE($3, r.admin_notes),
            updated_at = NOW()
       FROM previous p
      WHERE r.id = p.id
     RETURNING r.*, p.status AS previous_status`,
    [id, to, adminNotes],
  );

  if (result.rows.length === 0) {
    return { row: null, from: null, to, changed: false };
  }

  const { previous_status: from, ...row } = result.rows[0];

  if (from === to) {
    return { row, from, to, changed: false };
  }

  notify({ row, from, to, actor, adminNotes });

  // Fire and forget, as every caller did before: the row is committed and a
  // cold cache must not turn a successful action into an error.
  invalidateCache(cacheKeysFor(row)).catch((error) => {
    console.warn("Failed to invalidate request caches:", error.message);
  });

  return { row, from, to, changed: true };
}

/** Cache keys a request's status change can stale. */
function cacheKeysFor(row) {
  const keys = ["game-requests", "recent-requests"];
  if (row.user_id) {
    keys.push(`user-${row.user_id}-requests`);
    keys.push(`user-${row.user_id}-watchlist`);
  }
  return keys;
}

/** Announce the transition. Never allowed to fail the transition. */
function notify({ row, from, to, actor, adminNotes }) {
  const failed = (error) => {
    console.warn("Failed to send request status notification:", error.message);
  };

  if (to === "cancelled") {
    sendRequestCancelledDeletedNotification({
      id: row.id,
      title: row.title,
      user_name: row.user_name,
      action: "cancelled",
      reason: adminNotes || "",
      admin_name: actor || "Admin",
    }).catch(failed);
    return;
  }

  sendRequestStatusNotification({
    id: row.id,
    title: row.title,
    old_status: from,
    new_status: to,
    user_name: row.user_name,
    admin_notes: adminNotes,
  }).catch(failed);
}
