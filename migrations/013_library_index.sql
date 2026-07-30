-- Local index of the game library.
--
-- Retrom cannot answer an ordered, paged or searched query at all, and
-- ROMM can only do so expensively on a large library. Both feed this table
-- on a schedule instead, and every read is answered here by SQL.
--
-- added_at is nullable on purpose. A backend that cannot say when a game
-- arrived still supports a new-in-library shelf ordered by first_seen_at,
-- which is new to us rather than new to the library.

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
    added_at      TIMESTAMP,
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    synced_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    removed_at    TIMESTAMP,
    CONSTRAINT ggr_library_entries_kind_id_uniq UNIQUE (library_kind, library_id)
);

-- Every index below is partial on removed_at IS NULL, so a read query must
-- carry that predicate or the planner will not use it.

CREATE INDEX IF NOT EXISTS ggr_library_entries_igdb_idx
    ON ggr_library_entries (igdb_id)
 WHERE removed_at IS NULL AND igdb_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ggr_library_entries_recent_idx
    ON ggr_library_entries (COALESCE(added_at, first_seen_at) DESC)
 WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS ggr_library_entries_name_idx
    ON ggr_library_entries (lower(name))
 WHERE removed_at IS NULL;

-- Whether a sync has ever finished. An empty library and an unsynced one
-- cannot be told apart by counting rows, and a half-populated table looks
-- exactly like a finished small one.
--
-- last_completed_at is written only by a pass that enumerated the whole
-- library without throwing, which is the same event that authorises the
-- deletion sweep.

CREATE TABLE IF NOT EXISTS ggr_library_sync_state (
    library_kind      TEXT PRIMARY KEY,
    last_started_at   TIMESTAMP,
    last_completed_at TIMESTAMP,
    last_error        TEXT,
    entry_count       INTEGER NOT NULL DEFAULT 0
);
