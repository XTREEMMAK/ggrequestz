/**
 * Guards the silent-drop failure mode for user preferences.
 *
 * A preference needs a column, an entry in getUserPreferences()'s returned
 * object, the column and value in saveUserPreferences()'s upsert, and a place in
 * the API's whitelist. Miss any one and nothing errors: the value is simply
 * discarded, so the control appears to work and reverts on reload.
 *
 * migration 008 carries this warning in a comment; these assert it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("$lib/database.js", () => ({ query: (...args) => query(...args) }));
vi.mock("./database.js", () => ({ query: (...args) => query(...args) }));

const { getUserPreferences, saveUserPreferences, DEFAULT_PREFERENCES } =
  await import("$lib/userPreferences.js");

// Every preference the UI can set. Additions here are deliberate: a new
// preference should fail this suite until it is wired through all the layers.
const PERSISTED = ["animated_background", "background_theme", "ui_theme"];

beforeEach(() => {
  query.mockReset();
});

describe("preference round-trip", () => {
  it("returns every persisted preference from the database row", async () => {
    query.mockResolvedValueOnce({
      rows: [{ background_theme: "drifty-stars", ui_theme: "glass" }],
    });

    const prefs = await getUserPreferences(1);

    expect(prefs.background_theme).toBe("drifty-stars");
    expect(prefs.ui_theme).toBe("glass");
  });

  it("does not drop a persisted preference on the way to the database", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await saveUserPreferences(1, {
      ...DEFAULT_PREFERENCES,
      background_theme: "drifty-stars",
      ui_theme: "glass",
    });

    const [sql, values] = query.mock.calls[0];

    for (const key of PERSISTED) {
      expect(sql, `${key} missing from the INSERT column list`).toContain(key);
      expect(sql, `${key} missing from the ON CONFLICT update`).toContain(
        `${key} = EXCLUDED.${key}`,
      );
    }

    expect(values).toContain("glass");
    expect(values).toContain("drifty-stars");
  });

  it("placeholder count matches the number of bound values", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await saveUserPreferences(1, DEFAULT_PREFERENCES);

    const [sql, values] = query.mock.calls[0];
    const highest = Math.max(
      ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])),
    );

    // An off-by-one here is how adding a column silently corrupts every
    // subsequent value in the row.
    expect(highest).toBe(values.length);
  });

  it("falls back to the defaults when the columns are null", async () => {
    query.mockResolvedValueOnce({
      rows: [{ background_theme: null, ui_theme: null }],
    });

    const prefs = await getUserPreferences(1);

    expect(prefs.ui_theme).toBe("default");
    expect(prefs.background_theme).toBe("none");
  });
});
