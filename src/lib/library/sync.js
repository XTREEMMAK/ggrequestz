/**
 * Filling the library index.
 *
 * A backend enumerates itself, batch by batch, and each batch is upserted.
 * Deletion is the dangerous half and is gated twice: on the pass completing, so
 * a partial enumeration is never read as "the rest of the library is gone",
 * and on the size of what it is about to remove, so a pass that completed
 * against an empty backend cannot empty the index either.
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
 * The sweep's plausibility ceiling, when a caller does not supply one.
 *
 * Duplicated from config.js on purpose: syncLibrary is callable directly, and a
 * caller that forgot the option must still get a guarded sweep rather than an
 * unguarded one.
 */
const DEFAULT_MAX_SWEEP_RATIO = 0.5;

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
 * @param {number} [options.maxSweepRatio] - Largest share of the live index one
 *   pass may remove before the sweep refuses
 * @returns {Promise<{ran: boolean, completed: boolean, upserted: number,
 *   removed: number, sweepBlocked: boolean, resumed: boolean,
 *   reason: string|null}>}
 */
export async function syncLibrary({
  batchSize = DEFAULT_BATCH_SIZE,
  maxSweepRatio = DEFAULT_MAX_SWEEP_RATIO,
} = {}) {
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
      sweepBlocked: false,
      resumed: false,
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
        sweepBlocked: false,
        resumed: false,
        reason: "locked",
      };
    }

    let upserted = 0;
    let removed = 0;
    let completed = false;
    let sweepBlocked = false;
    let resumed = false;

    try {
      // Where an interrupted pass stopped, if one did. RomM's /roms has no
      // id-greater-than filter (see romm.js), so the walk is offset-based and
      // a failed pass used to restart at 0 -- on a 72,162-rom library that is
      // the whole 85-minute enumeration thrown away for one bad page.
      //
      // What this fixes and what it does not: a transient failure -- a timeout
      // blip, a tripped breaker, a container restart mid-pass -- now costs one
      // page instead of the walk. A page that is reliably too slow still
      // blocks the pass, because the resumed run starts on exactly that page.
      // The lever for that is a smaller LIBRARY_SYNC_BATCH, which resuming is
      // what makes worth pulling: the pages already taken are no longer
      // discarded on the way to finding a size that fits.
      const state = await query(
        `SELECT resume_offset, resume_upserted
           FROM ggr_library_sync_state
          WHERE library_kind = $1`,
        [kind],
      );

      const resumeOffset = Number(state.rows[0]?.resume_offset ?? 0) || 0;
      resumed = resumeOffset > 0;

      if (resumed) {
        // last_started_at is deliberately NOT moved. It is the sweep's
        // boundary and it belongs to the logical enumeration, not to this run
        // of it: reset here, every row the earlier runs already wrote would be
        // older than the boundary and the sweep would mark the whole library
        // removed.
        upserted = Number(state.rows[0]?.resume_upserted ?? 0) || 0;
        await query(
          `UPDATE ggr_library_sync_state SET last_error = NULL
            WHERE library_kind = $1`,
          [kind],
        );
      } else {
        // NOW(), not a JS Date. This value is the sweep's boundary, so it has
        // to be on the same clock as the synced_at values it is compared with.
        //
        // The resume columns are cleared with it. A walk starting from zero
        // must not inherit a stale offset -- from a backend that stopped
        // reporting progress, or from a pass whose completion write failed.
        await query(
          `INSERT INTO ggr_library_sync_state
             (library_kind, last_started_at, last_error, resume_offset, resume_upserted)
              VALUES ($1, NOW(), NULL, NULL, NULL)
         ON CONFLICT (library_kind)
         DO UPDATE SET last_started_at = NOW(), last_error = NULL,
                       resume_offset = NULL, resume_upserted = NULL`,
          [kind],
        );
      }

      await library.syncEntries({
        batchSize,
        startOffset: resumeOffset,
        onBatch: async (entries, progress) => {
          upserted += await upsertBatch(query, kind, entries);

          // Recorded per batch, so what is resumed from is a page that
          // actually landed. A backend with no offset to report -- Retrom's
          // GetGames takes no paging at all -- writes nothing here and is
          // simply never resumed.
          if (Number.isInteger(progress?.nextOffset)) {
            await query(
              `UPDATE ggr_library_sync_state
                  SET resume_offset = $2, resume_upserted = $3
                WHERE library_kind = $1`,
              [kind, progress.nextOffset, upserted],
            );
          }
        },
      });

      // Only now. Everything below this line depends on the enumeration having
      // been complete.
      completed = true;

      let swept;
      if (resumed) {
        // The third gate on deletion, and the one this change adds.
        //
        // An offset walk stitched across two points in time is not the same
        // enumeration as an offset walk done in one. A rom deleted from the
        // backend between the two runs shifts every later page left, so the
        // resume point steps over entries that were never enumerated by
        // either run -- and from the sweep's side that miss is
        // indistinguishable from those entries being gone. It would mark
        // games that still exist as removed, below the plausibility ratio and
        // therefore invisibly.
        //
        // Upserting is safe and still happens, so the index is refreshed and
        // becomes readable. Deletion waits for a pass that walked the whole
        // library in one run -- which is the next one, since completing here
        // clears the resume point.
        console.log(
          `📚 Library sync for ${kind}: resumed pass completed; ` +
            "removals deferred to the next uninterrupted walk",
        );
        swept = null;
      } else {
        swept = await sweep(query, kind, maxSweepRatio);
        removed = swept.removed;
        sweepBlocked = swept.blocked;
      }

      // `swept` is only ever null on the resumed branch, which cannot set
      // sweepBlocked, so the counts below are always the ones this pass read.
      if (sweepBlocked) {
        const message =
          `sweep refused: ${swept.stale} of ${swept.live} live entries ` +
          `would have been removed, above LIBRARY_SYNC_MAX_SWEEP_RATIO=${maxSweepRatio}`;

        console.warn(`⚠️ Library sync for ${kind}: ${message}`);

        // last_completed_at is still written. The enumeration did complete --
        // this pass learned the whole backend and upserted it -- and the index
        // is exactly as readable as it was a moment ago. Withholding the flag
        // would send every read back to its backend fallback, or to
        // indexBuilding for a backend that has none, which is a strictly worse
        // outcome than one stale removed_at. last_error carries the refusal so
        // it is visible without reading logs.
        await query(
          `UPDATE ggr_library_sync_state
              SET last_completed_at = NOW(), entry_count = $2, last_error = $3,
                  resume_offset = NULL, resume_upserted = NULL
            WHERE library_kind = $1`,
          [kind, upserted, message],
        );
      } else {
        // The resume point is cleared here and nowhere else. A pass that
        // throws leaves it exactly where the last landed batch put it, which
        // is the entire point.
        await query(
          `UPDATE ggr_library_sync_state
              SET last_completed_at = NOW(), entry_count = $2, last_error = NULL,
                  resume_offset = NULL, resume_upserted = NULL
            WHERE library_kind = $1`,
          [kind, upserted],
        );
      }
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

    return {
      ran: true,
      completed,
      upserted,
      removed,
      sweepBlocked,
      resumed,
      reason: null,
    };
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
 * is in. It was briefly an ISO string instead, to keep UTC digits out of the
 * reach of a `timestamp without time zone` column; that fixed the write and
 * left the read wrong by the app container's offset, because the driver
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
 * Mark entries the completed pass did not see, unless there are implausibly
 * many of them.
 *
 * Only ever called after a full enumeration. Called after a partial one it
 * would delete the part that was not reached.
 *
 * Completing is not by itself enough. rommRequest throws on a breaker-open,
 * non-2xx or timed-out page, so a failed page cannot arrive as an empty one --
 * but a *legitimate* `200 {items: []}` can, and does: RomM's own database
 * reset, the ROM volume unmounted before a rescan, LIBRARY_URL repointed at a
 * fresh instance. The pass completes honestly, sees nothing, and every row in
 * the index is older than the boundary. Soft-delete means the next good pass
 * heals it, but until then every read filters `removed_at IS NULL` and the
 * whole library reports absent.
 *
 * So the sweep first asks what proportion of the live index it is about to
 * take, in the same pass and in SQL, and refuses above maxSweepRatio. Both
 * counts come from one scan, and both are taken after the upserts -- so a
 * first-ever sync has just written every row it saw, stale is 0, and the guard
 * cannot trip on it. An index with nothing live yet is likewise never a trip:
 * a share of zero is not a number, and there is nothing to protect.
 *
 * The boundary is read back out of the table *in SQL*. It cannot be passed as
 * a parameter: synced_at is written by NOW() on the server, and a JS Date sent
 * into that comparison arrives on the app container's clock instead of the
 * database's. West of the database that makes the sweep a no-op for the length
 * of the offset. East of it -- an app on Europe/Berlin against a default-UTC
 * Postgres, an entirely ordinary self-hosted pairing -- every row the pass just
 * inserted satisfies `synced_at < startedAt`, so the first completed pass marks
 * the whole library removed. Round-tripping the value through JS to "fix" it
 * reintroduces the identical serialisation.
 *
 * @param {Function} query - Bound to the pass's single client
 * @param {string} kind - Library kind
 * @param {number} maxSweepRatio - Largest share of `live` that may be removed
 * @returns {Promise<{removed: number, blocked: boolean, live: number,
 *   stale: number}>}
 */
async function sweep(query, kind, maxSweepRatio) {
  const counts = await query(
    `SELECT count(*) AS live,
            count(*) FILTER (WHERE entry.synced_at < state.last_started_at)
              AS stale
       FROM ggr_library_entries entry
       CROSS JOIN (SELECT last_started_at
                     FROM ggr_library_sync_state
                    WHERE library_kind = $1) state
      WHERE entry.library_kind = $1
        AND entry.removed_at IS NULL`,
    [kind],
  );

  const live = Number(counts.rows[0]?.live ?? 0);
  const stale = Number(counts.rows[0]?.stale ?? 0);

  if (live > 0 && stale / live > maxSweepRatio) {
    return { removed: 0, blocked: true, live, stale };
  }

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

  return { removed: result.rowCount ?? 0, blocked: false, live, stale };
}
