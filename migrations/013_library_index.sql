-- Local index of the game library.
--
-- Retrom cannot answer an ordered, paged or searched query at all, and
-- ROMM can only do so expensively on a large library. Both feed this table
-- on a schedule instead, and every read is answered here by SQL.
--
-- added_at is nullable on purpose. A backend that cannot say when a game
-- arrived still supports a new-in-library shelf ordered by first_seen_at,
-- which is new to us rather than new to the library.
--
-- Every timestamp on this table is TIMESTAMPTZ, and that is load-bearing
-- rather than stylistic. `timestamp without time zone` stores digits and no
-- zone, and node-postgres turns those digits into a JS Date in the *process's*
-- local zone -- so an app container on TZ=America/Chicago (docker-compose.yml
-- passes TZ straight through, and this is a normal way to run it) reads back
-- an instant shifted by its own UTC offset, and added_at.toISOString() is
-- wrong by exactly that much. Writing UTC digits into the naive column fixes
-- the write and leaves the read broken, because the offset is reapplied on the
-- way out.
--
-- TIMESTAMPTZ stores an instant. node-postgres round-trips it correctly in
-- both directions whatever zone the app or the database is in, which makes the
-- whole class of bug impossible rather than merely avoided.

CREATE TABLE IF NOT EXISTS ggr_library_entries (
    id            SERIAL PRIMARY KEY,
    library_kind  TEXT NOT NULL,
    library_id    TEXT NOT NULL,
    igdb_id       TEXT,
    name          TEXT NOT NULL,
    platform_name TEXT,
    size_bytes    BIGINT,
    cover_url     TEXT,
    path          TEXT,
    added_at      TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at    TIMESTAMPTZ,
    CONSTRAINT ggr_library_entries_kind_id_uniq UNIQUE (library_kind, library_id)
);

-- Two indexes, one per read that has one. Both are partial on
-- removed_at IS NULL, so a read query must carry that predicate or the planner
-- will not use it.
--
-- There is deliberately no index for the name search. It is
-- `name ILIKE '%term%'`, and a leading wildcard cannot use a btree at any
-- collation -- an index on lower(name) would be write amplification on every
-- upsert of every pass in exchange for nothing. Making that search indexable
-- means pg_trgm (a GIN index on `name gin_trgm_ops`), which is a separate
-- decision with an extension behind it, not a column list.

CREATE INDEX IF NOT EXISTS ggr_library_entries_igdb_idx
    ON ggr_library_entries (igdb_id)
 WHERE removed_at IS NULL AND igdb_id IS NOT NULL;

-- library_id is part of the key, not decoration. first_seen_at defaults to
-- NOW(), the transaction timestamp, so a whole batch shares one value; without
-- a tiebreaker the recency sort is non-deterministic and LIMIT/OFFSET paging
-- repeats and skips rows. router.js orders by exactly these two columns in
-- these directions.
CREATE INDEX IF NOT EXISTS ggr_library_entries_recent_idx
    ON ggr_library_entries (COALESCE(added_at, first_seen_at) DESC, library_id DESC)
 WHERE removed_at IS NULL;

-- Whether a sync has ever finished. An empty library and an unsynced one
-- cannot be told apart by counting rows, and a half-populated table looks
-- exactly like a finished small one.
--
-- last_completed_at is written only by a pass that enumerated the whole
-- library without throwing, which is the same event that authorises the
-- deletion sweep.
--
-- These two stay naive on purpose. Neither value is ever handed to the
-- application -- router.js only asks whether last_completed_at IS NULL -- and
-- last_started_at is written by NOW() and compared against synced_at inside
-- the same session that wrote it, so the timestamp -> timestamptz cast in that
-- comparison resolves through one session's zone in both directions and cannot
-- shift. The bug above needs a value to escape into JS, and none does here.

CREATE TABLE IF NOT EXISTS ggr_library_sync_state (
    library_kind      TEXT PRIMARY KEY,
    last_started_at   TIMESTAMP,
    last_completed_at TIMESTAMP,
    last_error        TEXT,
    entry_count       INTEGER NOT NULL DEFAULT 0
);
