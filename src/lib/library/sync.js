/**
 * Filling the library index.
 *
 * A backend enumerates itself, batch by batch, and each batch is upserted.
 * Deletion is the dangerous half and is gated on the pass completing: a
 * partial enumeration must never be read as "the rest of the library is
 * gone".
 *
 * Two rules hold the whole pass together, and both were learned the hard way.
 * The pass runs on ONE connection, because the advisory lock that serialises
 * it is session-scoped. And every timestamp it compares comes from the
 * database, because the app's clock and Postgres's clock are not the same
 * clock -- see sweep().
 */

import { withClient } from "$lib/database.js";
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
 * The entire pass -- the lock, every upsert, the sweep, the state writes and
 * the unlock -- is issued on a single pooled client. `query()` releases its
 * client between calls, so taking the lock through it and releasing it through
 * it are two different sessions: the release returns false with a warning
 * rather than raising, nothing logs, and the real lock is held until the worker
 * exits. Every later cycle then reports `locked` forever. It looks fine on an
 * idle pool, where the same client happens to come back each time, and wedges
 * permanently as soon as there is concurrent traffic.
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

  return withClient(async (query) => {
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

    let upserted = 0;
    let removed = 0;
    let completed = false;

    try {
      // NOW(), not a JS Date. This value is the sweep's boundary, so it has to
      // be on the same clock as the synced_at values it is compared with.
      await query(
        `INSERT INTO ggr_library_sync_state (library_kind, last_started_at, last_error)
              VALUES ($1, NOW(), NULL)
         ON CONFLICT (library_kind)
         DO UPDATE SET last_started_at = NOW(), last_error = NULL`,
        [kind],
      );

      await library.syncEntries({
        batchSize,
        onBatch: async (entries) => {
          upserted += await upsertBatch(query, kind, entries);
        },
      });

      // Only now. Everything below this line depends on the enumeration having
      // been complete.
      completed = true;
      removed = await sweep(query, kind);

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
  });
}

/**
 * The last occurrence of each library_id.
 *
 * A batch carrying the same library_id twice does not merge, it *fails*:
 * `ON CONFLICT DO UPDATE command cannot affect row a second time`. That aborts
 * the statement, which aborts the pass, so last_completed_at is never written
 * and the index never becomes readable -- the failure mode is a permanently
 * unusable index rather than one bad row.
 *
 * RomM cannot produce it, because syncEntries pages with `order_by=id` and ids
 * within a page are distinct. A backend that has to enumerate per platform can
 * and will: Retrom's GetGames takes no paging, so a multi-platform title
 * arrives once per platform, in one batch.
 *
 * Last occurrence wins, which is what ON CONFLICT DO UPDATE would have left
 * behind had the statement been legal.
 *
 * @param {Array<Object>} entries - One batch, as the backend produced it
 * @returns {Array<Object>} - At most one entry per library_id
 */
function dedupeByLibraryId(entries) {
  const byId = new Map();
  // Map.set on an existing key replaces the value and keeps the original
  // position, so this is "last value, first-seen order".
  for (const entry of entries) byId.set(String(entry.id), entry);
  return [...byId.values()];
}

/**
 * Upsert one batch in a single statement.
 *
 * One INSERT per entry would mean a round trip per ROM -- 72,000 of them on a
 * large library, per pass. `unnest` turns the batch into a relation so the
 * whole thing is one statement regardless of size.
 *
 * added_at goes in as the Date normalizeEntry produced, with no conversion.
 * The column is TIMESTAMPTZ, so node-postgres sends the instant with its
 * offset and Postgres keeps the instant -- correct whatever zone either side
 * is in. It was briefly a UTC ISO string instead, to keep the right digits out
 * of the reach of a `timestamp without time zone` column; that fixed the write
 * and left the read wrong by the app container's offset, because the driver
 * reapplies the local zone when it builds a Date from naive digits.
 *
 * @param {Function} query - Bound to the pass's single client
 * @param {string} kind - Library kind
 * @param {Array<Object>} rawEntries - One batch, as the backend produced it
 * @returns {Promise<number>} - Rows written
 */
async function upsertBatch(query, kind, rawEntries) {
  if (!rawEntries?.length) return 0;

  const entries = dedupeByLibraryId(rawEntries);

  const result = await query(
    `INSERT INTO ggr_library_entries
       (library_kind, library_id, igdb_id, name, platform_name,
        size_bytes, cover_url, path, added_at, synced_at, removed_at)
     SELECT $1, entry.library_id, entry.igdb_id, entry.name,
            entry.platform_name, entry.size_bytes, entry.cover_url,
            entry.path, entry.added_at, NOW(), NULL
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[],
                   $6::bigint[], $7::text[], $8::text[], $9::timestamptz[])
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
 *
 * The boundary is read back out of the table *in SQL*. It cannot be passed as
 * a parameter: synced_at is written by NOW() on the server, and a JS Date sent
 * into that comparison arrives on the app container's clock rather than the
 * database's. West of the database that makes the sweep a no-op for the length
 * of the offset. East of it -- an app on Europe/Berlin against a default-UTC
 * Postgres, an entirely ordinary self-hosted pairing -- every row the pass
 * just inserted satisfies `synced_at < startedAt`, so the first completed pass
 * marks the whole library removed. Round-tripping the value through JS to
 * "fix" it reintroduces the identical serialisation.
 *
 * @param {Function} query - Bound to the pass's single client
 * @param {string} kind - Library kind
 * @returns {Promise<number>} - Rows marked removed
 */
async function sweep(query, kind) {
  const result = await query(
    `UPDATE ggr_library_entries
        SET removed_at = NOW()
      WHERE library_kind = $1
        AND removed_at IS NULL
        AND synced_at < (SELECT last_started_at
                           FROM ggr_library_sync_state
                          WHERE library_kind = $1)`,
    [kind],
  );
  return result.rowCount ?? 0;
}
