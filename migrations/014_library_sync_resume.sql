-- Migration: 014_library_sync_resume
-- Description: Let an interrupted enumeration resume where it stopped.
--
-- RomM's /roms exposes no id-greater-than filter, so the sync walks the library
-- with limit/offset and a pass that fails on one page used to start again at
-- offset 0. On a 72,162-rom library that is an 85-minute enumeration discarded
-- for a single bad page -- and if the page is reliably bad, last_completed_at
-- is never written and the index never becomes readable at all.
--
-- resume_offset is the offset the walk had reached when the last batch landed,
-- written after each batch and cleared when a pass completes. Only a pass that
-- completes clears it, so a pass that throws leaves the walk's position exactly
-- where it was.
--
-- resume_upserted carries the running row count across the resume. Without it a
-- pass that resumed near the end records entry_count as the few hundred rows
-- that one run wrote, which reads as a library that has just lost 70,000 games.
--
-- Both are nullable with no default, and NULL means "no interrupted pass".
-- INTEGER rather than BIGINT: this is an offset into a library listing, and
-- 2.1 billion roms is not a case worth a wider column.

ALTER TABLE ggr_library_sync_state
  ADD COLUMN IF NOT EXISTS resume_offset INTEGER;

ALTER TABLE ggr_library_sync_state
  ADD COLUMN IF NOT EXISTS resume_upserted INTEGER;
