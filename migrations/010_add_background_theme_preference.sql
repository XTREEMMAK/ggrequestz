-- Turns the animated background from a boolean toggle into a named selection.
--
-- 1.3.0 shipped `animated_background` as a checkbox for a single hard-coded
-- effect. That effect is now "Drifty Stars" and sits alongside "None", so
-- further backgrounds are a value here plus a branch in the component rather
-- than another column and another toggle.
--
-- The UPDATE carries existing opt-ins across. Without it every user who had
-- turned the background on would silently find it off after upgrading.
--
-- `animated_background` is deliberately left in place rather than dropped:
-- dropping is destructive, the migration runner has no transaction around a
-- run, and a stale column costs nothing. Nothing reads it any more — the
-- successor is `background_theme`.
--
-- Note this column alone is not enough for the preference to take effect.
-- getUserPreferences() and saveUserPreferences() in src/lib/userPreferences.js
-- both enumerate fields explicitly, and the preferences endpoint filters
-- incoming keys against a whitelist. A column missing from any of those three is
-- silently dropped rather than erroring.

ALTER TABLE ggr_user_preferences
  ADD COLUMN IF NOT EXISTS background_theme VARCHAR(32) DEFAULT 'none';

-- The background_theme guard stops this overwriting a user who already holds a
-- non-default value, but it does NOT make the statement safely re-runnable:
-- someone who opted in under the old boolean and has since chosen None still
-- reads as `animated_background IS TRUE`, so a second run would resurrect their
-- old setting. Migrations are tracked by filename in ggr_migrations and run
-- once, which is what makes that acceptable — do not re-run this by hand
-- against a live database.
UPDATE ggr_user_preferences
  SET background_theme = 'drifty-stars'
  WHERE animated_background IS TRUE
    AND background_theme = 'none';

COMMENT ON COLUMN ggr_user_preferences.background_theme IS
  'Animated background selection: "none" or "drifty-stars". Supersedes animated_background.';

COMMENT ON COLUMN ggr_user_preferences.animated_background IS
  'Deprecated as of 1.4.0; superseded by background_theme. Retained for rollback only.';
