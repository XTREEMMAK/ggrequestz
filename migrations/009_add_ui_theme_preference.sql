-- Adds a UI theme preference for the application chrome.
--
-- Deliberately a string rather than a boolean. The first non-default theme is
-- "glass", but the point of the column is that later themes are additive: a new
-- value here plus a CSS block, not another migration and another toggle.
--
-- Independent of animated_background: the background and the chrome are themed
-- separately on purpose, so either can be used without the other.
--
-- Note this column alone is not enough for the preference to take effect.
-- getUserPreferences() and saveUserPreferences() in src/lib/userPreferences.js
-- both enumerate fields explicitly, and the preferences endpoint filters
-- incoming keys against a whitelist. A column missing from any of those three is
-- silently dropped rather than erroring.

ALTER TABLE ggr_user_preferences
  ADD COLUMN IF NOT EXISTS ui_theme VARCHAR(32) DEFAULT 'default';

COMMENT ON COLUMN ggr_user_preferences.ui_theme IS
  'Theme applied to the application chrome (sidebar, top bar). "default" or "glass".';
