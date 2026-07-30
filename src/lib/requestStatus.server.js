/**
 * The one place a request's status changes.
 *
 * Four routes used to update status and each did its own side effects:
 * admin/api/requests/update notified Gotify and invalidated cache,
 * bulk-update sent a bulk notification, admin/requests/[id]/edit did
 * neither -- approving there notified nobody -- and api/request/rescind wrote
 * `cancelled` directly, so a user withdrawing a request produced no
 * cancellation notification and no cache invalidation and the request kept
 * showing as open. Centralising the transition makes "did we remember to
 * notify?" a question that cannot be answered differently per call site.
 */

import { query } from "$lib/database.js";
import {
  sendRequestStatusNotification,
  sendRequestCancelledDeletedNotification,
  sendBulkRequestStatusNotification,
} from "$lib/gotify.js";
import { invalidateCache } from "$lib/cache.js";
import { sendGameRequestWebhook } from "$lib/webhooks.server.js";
import { findOpenDuplicate } from "$lib/requestPolicy.server.js";

// Postgres unique_violation. Raised by migration 009's two partial unique
// indexes over status IN ('pending','approved').
const UNIQUE_VIOLATION = "23505";

/** Deferred side effects for an outcome that has none. */
const NO_SIDE_EFFECTS = () => {};

const NO_CONFLICT_FOUND = {
  existing_request_id: null,
  existing_status: null,
  existing_user_name: null,
};

const STATUS_SQL = `WITH previous AS (
         SELECT id, status FROM ggr_game_requests WHERE id = $1 FOR UPDATE
     )
     UPDATE ggr_game_requests r
        SET status = $2,
            admin_notes = CASE WHEN $4 THEN $3 ELSE r.admin_notes END,
            updated_at = NOW()
       FROM previous p
      WHERE r.id = p.id
     RETURNING r.*, p.status AS previous_status`;

/**
 * Whether an error is one of the duplicate-guard indexes rejecting a write.
 * @param {*} error - The caught error
 * @returns {boolean}
 */
export function isDuplicateRequestViolation(error) {
  return error?.code === UNIQUE_VIOLATION;
}

/**
 * A write lost to the duplicate guard and the caller must not retry blindly.
 *
 * Carries the superseding request so a route can tell an admin which row is in
 * the way, and doubles as the signal that rolls a transaction back: throwing it
 * out of a `withTransaction` callback aborts the batch rather than leaving part
 * of it committed.
 */
export class RequestConflictError extends Error {
  /**
   * @param {Object} conflict - As returned by describeRequestConflict
   * @param {string} action - What was being attempted, as a phrase completing
   *   "Resolve it before ..." (e.g. `moving this request to approved`)
   */
  constructor(conflict, action) {
    super(requestConflictMessage(conflict, action));
    this.name = "RequestConflictError";
    this.conflict = conflict;
    this.action = action;
  }
}

/**
 * Human-readable "this is what is in the way" text.
 *
 * One builder for every conflict response, so the three admin paths and the
 * submission 409 all phrase it the same way.
 *
 * @param {Object} conflict - As returned by describeRequestConflict
 * @param {string} action - Phrase completing "Resolve it before ..."
 * @returns {string}
 */
export function requestConflictMessage(conflict, action) {
  if (!conflict?.existing_request_id) {
    return `Another open request already covers this game. Resolve it before ${action}.`;
  }

  const who = conflict.existing_user_name
    ? ` from ${conflict.existing_user_name}`
    : "";
  return (
    `Request ${conflict.existing_request_id}${who} is already ` +
    `${conflict.existing_status} for the same game. ` +
    `Resolve it before ${action}.`
  );
}

/**
 * Name the open request a duplicate-guard violation collided with.
 *
 * Deliberately reads through the module-level `query` rather than any caller
 * transaction: by the time this runs that transaction is aborted and will
 * accept nothing but ROLLBACK. It therefore sees committed state only, which
 * is what the admin needs -- the row that is really in the way.
 *
 * Advisory, never load-bearing: it returns nulls rather than throwing, so a
 * failure to name the conflict still leaves the caller able to report one.
 *
 * @param {Object} params
 * @param {string} params.id - The request whose write was rejected
 * @param {string} [params.title] - The title being written, when it differs
 *   from the stored one; a rename can collide on the title index
 * @returns {Promise<{existing_request_id: string|null, existing_status: string|null, existing_user_name: string|null}>}
 */
export async function describeRequestConflict({ id, title }) {
  try {
    const stored = await query(
      "SELECT igdb_id, title, request_type FROM ggr_game_requests WHERE id = $1",
      [id],
    );
    const row = stored.rows[0];
    if (!row) return NO_CONFLICT_FOUND;

    const other = await findOpenDuplicate({
      igdbId: row.igdb_id,
      title: title ?? row.title,
      requestType: row.request_type,
    });

    // `other` can be the row itself when it is already open -- a rename
    // colliding on the title index, for instance. That is not the conflict.
    if (!other || other.id === id) return NO_CONFLICT_FOUND;

    return {
      existing_request_id: other.id,
      existing_status: other.status,
      existing_user_name: other.user_name ?? null,
    };
  } catch (error) {
    console.warn("Failed to identify the conflicting request:", error.message);
    return NO_CONFLICT_FOUND;
  }
}

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
 * A row re-entering the open set -- `rejected`, `cancelled` or `fulfilled`
 * back to `pending` or `approved` -- can lose to migration 009's partial
 * unique indexes when another open request already covers that game. Every
 * step of that sequence is legitimate, so it is reported as a `conflict`
 * outcome rather than thrown: the caller can answer 409 naming the blocking
 * row instead of emitting a bare 500 and stranding the request.
 *
 * @param {Object} params
 * @param {string} params.id - Request UUID
 * @param {string} params.to - New status
 * @param {string|null} [params.actor] - Display name of whoever acted
 * @param {string|null} [params.adminNotes] - Notes to write; omit (leave
 *   undefined) to keep the existing value, pass "" or null to clear it
 * @param {Function} [params.tx] - A transaction-scoped query function from
 *   `withTransaction`. When given, the write joins that transaction, and the
 *   caller should also pass `deferSideEffects` so nothing is dispatched for a
 *   write that may still roll back.
 * @param {boolean} [params.deferSideEffects=false] - Return the side effects
 *   as `runSideEffects()` for the caller to invoke after commit, instead of
 *   firing them here.
 * @param {boolean} [params.perRowNotifications=true] - Set false when a batch
 *   caller is sending one summary notification and invalidating cache once for
 *   the whole batch. The approval dispatch is never batched: it stays per row,
 *   exactly once.
 * @returns {Promise<{row: Object|null, from: string|null, to: string, changed: boolean, conflict?: Object, runSideEffects?: Function}>}
 */
export async function applyRequestStatusChange({
  id,
  to,
  actor = null,
  adminNotes,
  tx = null,
  deferSideEffects = false,
  perRowNotifications = true,
}) {
  const run = tx ?? query;
  const setNotes = adminNotes !== undefined;
  const notesValue = setNotes ? adminNotes || null : null;

  // Callers in deferred mode invoke runSideEffects() unconditionally, so every
  // outcome carries one -- a no-op for the outcomes that have no side effects.
  const deferred = (outcome) =>
    deferSideEffects
      ? { ...outcome, runSideEffects: NO_SIDE_EFFECTS }
      : outcome;

  let result;
  try {
    result = await run(STATUS_SQL, [id, to, notesValue, setNotes]);
  } catch (error) {
    if (!isDuplicateRequestViolation(error)) throw error;
    return deferred({
      row: null,
      from: null,
      to,
      changed: false,
      conflict: await describeRequestConflict({ id }),
    });
  }

  if (result.rows.length === 0) {
    return deferred({ row: null, from: null, to, changed: false });
  }

  const { previous_status: from, ...row } = result.rows[0];

  if (from === to) {
    return deferred({ row, from, to, changed: false });
  }

  const sideEffects = () => {
    if (perRowNotifications) {
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
    }

    if (to === "approved") {
      // `from !== to` is guaranteed above, so an approved request being
      // re-saved never reaches here. `from` travels with it so a receiver can
      // tell a re-fetch from a first fetch.
      onRequestApproved(row, from);
    }

    if (perRowNotifications) {
      invalidateRequestCaches([row]);
    }
  };

  if (deferSideEffects) {
    return { row, from, to, changed: true, runSideEffects: sideEffects };
  }

  sideEffects();
  return { row, from, to, changed: true };
}

/**
 * Apply one transition to many requests as a single unit.
 *
 * Row by row, because per-row atomicity is what makes each transition's
 * from/to detection correct and each approval dispatch fire exactly once --
 * one `UPDATE ... WHERE id IN (...)` cannot say which rows actually changed.
 *
 * Notifications and cache invalidation are not per row: bulk-approving 100
 * requests used to send one summary push, and going per row turned that into
 * 100 pushes, 100 settings reads and 100 cache invalidations. One summary
 * notification and one invalidation are restored here. The approval dispatch
 * stays per row -- it is the request's own event, not a summary.
 *
 * The caller runs this inside `withTransaction` and passes `tx`, so a row
 * losing to the duplicate guard rolls the whole batch back rather than leaving
 * rows 1..k-1 committed with their webhooks already in flight. Nothing is
 * dispatched until the caller invokes `runSideEffects()` after commit.
 *
 * @param {Object} params
 * @param {string[]} params.ids - Request UUIDs
 * @param {string} params.to - New status
 * @param {string|null} [params.actor] - Display name of whoever acted
 * @param {string|null} [params.adminNotes] - Notes to write, as for
 *   applyRequestStatusChange
 * @param {Function} [params.tx] - Transaction-scoped query function
 * @returns {Promise<{rows: Object[], conflict: Object|null, runSideEffects: Function}>}
 */
export async function applyRequestStatusChangeBatch({
  ids,
  to,
  actor = null,
  adminNotes,
  tx = null,
}) {
  const rows = [];
  const dispatches = [];

  for (const id of ids) {
    const outcome = await applyRequestStatusChange({
      id,
      to,
      actor,
      adminNotes,
      tx,
      deferSideEffects: true,
      perRowNotifications: false,
    });

    if (outcome.conflict) {
      // Stop at the first conflict. The caller aborts the transaction, so
      // whatever the earlier rows wrote is discarded with it -- and none of
      // them has dispatched anything, because nothing runs until commit.
      return {
        rows: [],
        conflict: outcome.conflict,
        runSideEffects: NO_SIDE_EFFECTS,
      };
    }

    if (!outcome.row) continue;
    rows.push(outcome.row);
    if (outcome.changed) dispatches.push(outcome.runSideEffects);
  }

  const runSideEffects = () => {
    for (const dispatch of dispatches) dispatch();
    if (rows.length === 0) return;

    sendBulkRequestStatusNotification({
      requests: rows,
      status: to,
      actor,
    }).catch((error) => {
      console.warn("Failed to send bulk status notification:", error.message);
    });

    invalidateRequestCaches(rows);
  };

  return { rows, conflict: null, runSideEffects };
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
 * @param {string|null} [previousStatus] - The status the request left, or null
 *   when it was created already approved. Lets the payload distinguish a
 *   re-fetch from a first fetch.
 * @returns {void}
 */
export function onRequestApproved(row, previousStatus = null) {
  sendGameRequestWebhook(row, { previousStatus }).catch((error) => {
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
 * Drop the caches these rows appear in, in one call.
 *
 * Fire and forget, as every caller did before: the rows are committed and a
 * cold cache must not turn a successful action into an error.
 */
function invalidateRequestCaches(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const key of cacheKeysFor(row)) keys.add(key);
  }

  invalidateCache([...keys]).catch((error) => {
    console.warn("Failed to invalidate request caches:", error.message);
  });
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
