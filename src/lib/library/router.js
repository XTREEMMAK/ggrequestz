/**
 * Where a library read is answered from.
 *
 * The index once it holds a completed sync, the backend directly when the
 * index is empty and the backend can do it, and an explicit indexBuilding
 * state when neither is possible. A Retrom install before its first sync is
 * not unreachable and not empty -- it is not indexed yet, and saying so is
 * better than inventing an outage.
 */

import { query } from "$lib/database.js";
import { getLibrary } from "$lib/library/index.js";
import { CAPABILITIES, LIST_ORDERS } from "./types.js";

const COLUMNS = `library_id, igdb_id, name, platform_name, size_bytes,
                 cover_url, path, added_at, first_seen_at`;

/**
 * Recency, preferring the backend's own timestamp over when we first saw it,
 * with library_id as the tiebreaker.
 *
 * The tiebreaker is not cosmetic. first_seen_at defaults to NOW(), which is the
 * *transaction* timestamp, so every row of one `unnest` batch shares a single
 * value to the microsecond. For a backend that reports no added_at -- Retrom --
 * the whole library then has roughly one distinct sort key per batch, and
 * LIMIT/OFFSET over a non-deterministic order repeats and skips entries between
 * one page load and the next.
 *
 * ggr_library_entries_recent_idx is declared on the same two columns in the
 * same directions, so the sort is still served by the index.
 */
const RECENCY_ORDER = "COALESCE(added_at, first_seen_at) DESC, library_id DESC";

/** An index row, in the seam's vocabulary. */
function fromRow(row) {
  return {
    id: row.library_id,
    name: row.name,
    platformName: row.platform_name,
    igdbId: row.igdb_id,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    addedAt: row.added_at ?? row.first_seen_at ?? null,
    coverUrl: row.cover_url,
    path: row.path,
  };
}

/** Has a sync ever finished for this backend? */
async function indexIsReady(kind) {
  const result = await query(
    `SELECT last_completed_at FROM ggr_library_sync_state
      WHERE library_kind = $1 AND last_completed_at IS NOT NULL`,
    [kind],
  );
  return result.rows.length > 0;
}

function building() {
  return { source: "none", indexBuilding: true, entries: [] };
}

/**
 * The most recently added entries.
 *
 * @param {{limit?: number, offset?: number}} [options]
 * @returns {Promise<{source: string, indexBuilding: boolean, entries: Array}>}
 */
export async function recentEntries({ limit = 24, offset = 0 } = {}) {
  const library = getLibrary();
  const kind = library.kind();

  if (await indexIsReady(kind)) {
    const result = await query(
      `SELECT ${COLUMNS} FROM ggr_library_entries
        WHERE library_kind = $1 AND removed_at IS NULL
        ORDER BY ${RECENCY_ORDER}
        LIMIT $2 OFFSET $3`,
      [kind, limit, offset],
    );
    return {
      source: "index",
      indexBuilding: false,
      entries: result.rows.map(fromRow),
    };
  }

  if (!library.capabilities().has(CAPABILITIES.LIST_RECENT)) return building();

  return {
    source: "backend",
    indexBuilding: false,
    entries: await library.listEntries({ limit, offset }),
  };
}

/**
 * Entries whose name matches.
 *
 * @param {{search: string, limit?: number, offset?: number}} options
 * @returns {Promise<{source: string, indexBuilding: boolean, entries: Array}>}
 */
export async function searchEntries({ search, limit = 24, offset = 0 }) {
  const library = getLibrary();
  const kind = library.kind();

  if (await indexIsReady(kind)) {
    const result = await query(
      `SELECT ${COLUMNS} FROM ggr_library_entries
        WHERE library_kind = $1 AND removed_at IS NULL AND name ILIKE $2
        ORDER BY ${RECENCY_ORDER}
        LIMIT $3 OFFSET $4`,
      [kind, `%${search}%`, limit, offset],
    );
    return {
      source: "index",
      indexBuilding: false,
      entries: result.rows.map(fromRow),
    };
  }

  if (!library.capabilities().has(CAPABILITIES.SEARCH)) return building();

  return {
    source: "backend",
    indexBuilding: false,
    entries: await library.listEntries({
      limit,
      offset,
      search,
      // Asked for, not left to the default. Omitting `order` means RECENT,
      // which makes RomM sort a *search* by created_at desc and throws the
      // backend's own ranking away -- the exact inference LIST_ORDERS exists
      // to replace.
      order: LIST_ORDERS.RELEVANCE,
    }),
  };
}

/**
 * Entries for a set of IGDB ids, for cross-referencing.
 *
 * One query for the whole set. The code this replaces fetched the 2000 most
 * recently added ROMs and matched against that window, which on a 72k
 * library is wrong for about 97 percent of it.
 *
 * There is deliberately no backend fallback here, so a caller must keep using
 * its existing cross-reference path for as long as `indexBuilding` is true.
 *
 * @param {Array<string|number>} igdbIds
 * @returns {Promise<{source: string, indexBuilding: boolean, entries: Array}>}
 */
export async function entriesByIgdbIds(igdbIds) {
  const ids = (igdbIds ?? [])
    // Stringified on the way in. The old lookup stringified on insert and
    // not on read, so a numeric id never matched.
    .map((id) => (id === null || id === undefined ? null : String(id)))
    .filter(Boolean);

  if (ids.length === 0) {
    return { source: "index", indexBuilding: false, entries: [] };
  }

  const library = getLibrary();
  const kind = library.kind();

  if (!(await indexIsReady(kind))) return building();

  const result = await query(
    `SELECT ${COLUMNS} FROM ggr_library_entries
      WHERE library_kind = $1 AND removed_at IS NULL AND igdb_id = ANY($2)`,
    [kind, ids],
  );

  return {
    source: "index",
    indexBuilding: false,
    entries: result.rows.map(fromRow),
  };
}
