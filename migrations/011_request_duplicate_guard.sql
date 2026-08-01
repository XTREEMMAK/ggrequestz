-- Duplicate-request guard.
--
-- ggr_game_requests carried only its primary key, so the same game could be
-- requested without limit and the 23505 handler in the submission route was
-- unreachable.
--
-- Uniqueness is scoped to OPEN requests only: a rejected, cancelled or
-- fulfilled request must not block a new one, so a failed fetch can be
-- retried. request_type is part of the key because a "fix" and a "game"
-- request for one title are different intents.
--
-- Best-effort, not a guarantee. The two indexes below are partitioned on
-- whether igdb_id is null, which makes them different keys: a request carrying
-- an igdb_id and one carrying none can both be open for the same title, and
-- both will dispatch. igdb_id is client-supplied, so that is reachable on
-- purpose as well as by accident. Treat this as suppressing the common case,
-- not as the thing that makes a double fetch impossible.

-- Existing installs may already hold duplicates, which would abort index
-- creation and, because AUTO_MIGRATE runs at container start, the boot.
-- Collapse them first, oldest wins, with an audit trail.

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY igdb_id, request_type
               ORDER BY created_at ASC, id ASC
           ) AS rn
      FROM ggr_game_requests
     WHERE status IN ('pending', 'approved')
       AND igdb_id IS NOT NULL
)
UPDATE ggr_game_requests r
   SET status = 'cancelled',
       admin_notes = concat_ws(
           E'\n', r.admin_notes,
           'Auto-cancelled by migration 011: duplicate of an older open request for the same game.'
       ),
       updated_at = NOW()
  FROM ranked
 WHERE r.id = ranked.id
   AND ranked.rn > 1;

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY lower(btrim(title)), request_type
               ORDER BY created_at ASC, id ASC
           ) AS rn
      FROM ggr_game_requests
     WHERE status IN ('pending', 'approved')
       AND igdb_id IS NULL
)
UPDATE ggr_game_requests r
   SET status = 'cancelled',
       admin_notes = concat_ws(
           E'\n', r.admin_notes,
           'Auto-cancelled by migration 011: duplicate of an older open request for the same title.'
       ),
       updated_at = NOW()
  FROM ranked
 WHERE r.id = ranked.id
   AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ggr_game_requests_open_igdb_uniq
    ON ggr_game_requests (igdb_id, request_type)
 WHERE status IN ('pending', 'approved') AND igdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ggr_game_requests_open_title_uniq
    ON ggr_game_requests (lower(btrim(title)), request_type)
 WHERE status IN ('pending', 'approved') AND igdb_id IS NULL;
