/**
 * Filling the library index.
 *
 * A backend enumerates itself, batch by batch, and each batch is upserted.
 * Deletion is the dangerous half and is gated on the pass completing: a
 * partial enumeration must never be read as "the rest of the library is
 * gone".
 */

import { query } from "$lib/database.js";
import { getLibrary } from "$lib/library/index.js";
import { CAPABILITIES } from "./types.js";

/**
 * Namespace for the sync lock. A module-level constant rather than a hash of
 * a string, so it is greppable and cannot collide by accident.
 */
export const ADVISORY_LOCK_KEY = 4919002;

const DEFAULT_BATCH_SIZE = 500;

/**
 * Run one sync pass, if this worker wins the lock.
 *
 * @param {Object} [options]
 * @param {number} [options.batchSize] - Entries per upsert
 * @returns {Promise<{ran: boolean, completed: boolean, upserted: number,
 *   removed: number, reason: string|null}>}
 */
export async function syncLibrary({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const library = getLibrary();
  const kind = library.kind();

  if (!library.capabilities().has(CAPABILITIES.SYNC)) {
    // Mandatory, so this means a backend was built wrong rather than an
    // operator configuring something unusual.
    return {
      ran: false,
      completed: false,
      upserted: 0,
      removed: 0,
      reason: "unsupported",
    };
  }

  // instances: "max" means a bare interval runs once per CPU core. Not
  // blocking: a cycle we lose is a cycle another worker is already running.
  const lock = await query("SELECT pg_try_advisory_lock($1) AS locked", [
    ADVISORY_LOCK_KEY,
  ]);

  if (!lock.rows[0]?.locked) {
    return {
      ran: false,
      completed: false,
      upserted: 0,
      removed: 0,
      reason: "locked",
    };
  }

  const startedAt = new Date();
  let upserted = 0;
  let removed = 0;
  let completed = false;

  try {
    await query(
      `INSERT INTO ggr_library_sync_state (library_kind, last_started_at, last_error)
            VALUES ($1, $2, NULL)
       ON CONFLICT (library_kind)
       DO UPDATE SET last_started_at = $2, last_error = NULL`,
      [kind, startedAt],
    );

    await library.syncEntries({
      batchSize,
      onBatch: async (entries) => {
        upserted += await upsertBatch(kind, entries);
      },
    });

    // Only now. Everything below this line depends on the enumeration having
    // been complete.
    completed = true;
    removed = await sweep(kind, startedAt);

    await query(
      `UPDATE ggr_library_sync_state
          SET last_completed_at = NOW(), entry_count = $2, last_error = NULL
        WHERE library_kind = $1`,
      [kind, upserted],
    );
  } catch (error) {
    console.error(`Library sync failed for ${kind}:`, error.message);
    await query(
      "UPDATE ggr_library_sync_state SET last_error = $2 WHERE library_kind = $1",
      [kind, error.message],
    ).catch(() => {});
  } finally {
    await query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(
      () => {},
    );
  }

  return { ran: true, completed, upserted, removed, reason: null };
}

/**
 * Upsert one batch in a single statement.
 *
 * One INSERT per entry would mean a round trip per ROM -- 72,000 of them on a
 * large library, per pass. `unnest` turns the batch into a relation so the
 * whole thing is one statement regardless of size.
 */
async function upsertBatch(kind, entries) {
  if (!entries?.length) return 0;

  const result = await query(
    `INSERT INTO ggr_library_entries
       (library_kind, library_id, igdb_id, name, platform_name,
        size_bytes, cover_url, path, added_at, synced_at, removed_at)
     SELECT $1, entry.library_id, entry.igdb_id, entry.name,
            entry.platform_name, entry.size_bytes, entry.cover_url,
            entry.path, entry.added_at, NOW(), NULL
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[],
                   $6::bigint[], $7::text[], $8::text[], $9::timestamp[])
         AS entry(library_id, igdb_id, name, platform_name,
                  size_bytes, cover_url, path, added_at)
     ON CONFLICT (library_kind, library_id)
     DO UPDATE SET
       igdb_id = EXCLUDED.igdb_id,
       name = EXCLUDED.name,
       platform_name = EXCLUDED.platform_name,
       size_bytes = EXCLUDED.size_bytes,
       cover_url = EXCLUDED.cover_url,
       path = EXCLUDED.path,
       added_at = EXCLUDED.added_at,
       synced_at = NOW(),
       removed_at = NULL`,
    [
      kind,
      entries.map((entry) => entry.id),
      entries.map((entry) => entry.igdbId ?? null),
      entries.map((entry) => entry.name),
      entries.map((entry) => entry.platformName ?? null),
      entries.map((entry) => entry.sizeBytes ?? null),
      entries.map((entry) => entry.coverUrl ?? null),
      entries.map((entry) => entry.path ?? null),
      entries.map((entry) => entry.addedAt ?? null),
    ],
  );

  return result.rowCount ?? entries.length;
}

/**
 * Mark entries the completed pass did not see.
 *
 * Only ever called after a full enumeration. Called after a partial one it
 * would delete the part that was not reached.
 */
async function sweep(kind, startedAt) {
  const result = await query(
    `UPDATE ggr_library_entries
        SET removed_at = NOW()
      WHERE library_kind = $1
        AND removed_at IS NULL
        AND synced_at < $2`,
    [kind, startedAt],
  );
  return result.rowCount ?? 0;
}
