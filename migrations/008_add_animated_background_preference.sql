-- Adds an opt-in animated background preference.
--
-- Off by default: the effect is decorative, costs a requestAnimationFrame loop
-- for as long as the page is open, and nobody upgrading asked for it.
--
-- Note this column alone is not enough for the preference to take effect:
-- getUserPreferences() in src/lib/userPreferences.js whitelists fields into the
-- object it returns, so a column with no matching key there is read from the
-- database and then silently dropped.

ALTER TABLE ggr_user_preferences
  ADD COLUMN IF NOT EXISTS animated_background BOOLEAN DEFAULT false;

COMMENT ON COLUMN ggr_user_preferences.animated_background IS
  'Render the ambient particle background on authenticated pages. Opt-in.';
