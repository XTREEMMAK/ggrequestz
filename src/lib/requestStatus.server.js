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
import { sendGameRequestWebhook } from "$lib/webhooks.server.js";

/**
 * Change a request's status and perform everything that follows from it.
 *
 * The read and the write are one statement under FOR UPDATE, so two admins
 * approving at once cannot both observe the old status and both fire the
 * side effects.
 *
 * `adminNotes` distinguishes "the caller didn't mention notes" from "the
 * caller is setting notes, including clearing them": pass `undefined` (i.e.
 * omit the key entirely) to leave the existing notes column untouched, or
 * supply any other value -- including `null` or `""` -- to overwrite it.
 * An empty string is normalised to `null` in the column. This is carried
 * into SQL as an explicit boolean flag rather than folded into the value
 * itself, so a deliberate "clear the notes" cannot be mistaken for "notes
 * not supplied" (or vice versa) the way a single COALESCE-on-value would.
 *
 * @param {Object} params
 * @param {string} params.id - Request UUID
 * @param {string} params.to - New status
 * @param {string|null} [params.actor] - Display name of whoever acted
 * @param {string|null} [params.adminNotes] - Notes to write; omit (leave
 *   undefined) to keep the existing value, pass "" or null to clear it
 * @returns {Promise<{row: Object|null, from: string|null, to: string, changed: boolean}>}
 */
export async function applyRequestStatusChange({
  id,
  to,
  actor = null,
  adminNotes,
}) {
  const setNotes = adminNotes !== undefined;
  const notesValue = setNotes ? adminNotes || null : null;

  const result = await query(
    `WITH previous AS (
         SELECT id, status FROM ggr_game_requests WHERE id = $1 FOR UPDATE
     )
     UPDATE ggr_game_requests r
        SET status = $2,
            admin_notes = CASE WHEN $4 THEN $3 ELSE r.admin_notes END,
            updated_at = NOW()
       FROM previous p
      WHERE r.id = p.id
     RETURNING r.*, p.status AS previous_status`,
    [id, to, notesValue, setNotes],
  );

  if (result.rows.length === 0) {
    return { row: null, from: null, to, changed: false };
  }

  const { previous_status: from, ...row } = result.rows[0];

  if (from === to) {
    return { row, from, to, changed: false };
  }

  // Only carry notes into the notification when this transition actually
  // wrote them. When the caller omitted adminNotes, the column is left
  // untouched -- row.admin_notes may hold text a previous, unrelated
  // transition wrote (e.g. an earlier rejection reason), and presenting
  // that as the reason for *this* transition would be wrong.
  notify({
    row,
    from,
    to,
    actor,
    notes: setNotes ? row.admin_notes : undefined,
  });

  if (to === "approved") {
    // `from !== to` is guaranteed above, so an approved request being re-saved
    // never reaches here.
    onRequestApproved(row);
  }

  // Fire and forget, as every caller did before: the row is committed and a
  // cold cache must not turn a successful action into an error.
  invalidateCache(cacheKeysFor(row)).catch((error) => {
    console.warn("Failed to invalidate request caches:", error.message);
  });

  return { row, from, to, changed: true };
}

/**
 * A request has entered `approved`. Announce it to configured automation.
 *
 * The one dispatch point. Reached from auto-approved creation and from an
 * admin approving, so a receiver sees one event per approval regardless of
 * which door the request came through.
 *
 * Fire and forget: the row is already committed, so a slow or absent receiver
 * must not turn a successful approval into an error.
 *
 * @param {Object} row - The ggr_game_requests row, as stored
 * @returns {void}
 */
export function onRequestApproved(row) {
  sendGameRequestWebhook(row).catch((error) => {
    console.warn("Failed to send request webhook:", error.message);
  });
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

/**
 * Announce the transition. Never allowed to fail the transition.
 *
 * `notes` is the admin notes this transition wrote, or `undefined` when the
 * caller didn't set any -- never the persisted column read unconditionally,
 * since that could resurface a stale note from an earlier transition.
 */
function notify({ row, from, to, actor, notes }) {
  const failed = (error) => {
    console.warn("Failed to send request status notification:", error.message);
  };

  if (to === "cancelled") {
    sendRequestCancelledDeletedNotification({
      id: row.id,
      title: row.title,
      user_name: row.user_name,
      action: "cancelled",
      reason: notes || "",
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
    admin_notes: notes,
  }).catch(failed);
}
