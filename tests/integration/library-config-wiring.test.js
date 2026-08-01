/**
 * Regression tests for LIBRARY_* actually reaching the RomM client.
 *
 * config.js documented LIBRARY_URL and LIBRARY_API_TOKEN and nothing read
 * them: every consumer went to ROMM_* directly, so an operator who followed
 * .env.example got isRommConfigured() === false and a library section that
 * silently disappeared with no error anywhere. These pin both directions of
 * the fallback -- the new names must work, and a ROMM_*-only install must be
 * untouched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// romm.server.js imports this at module scope for IGDB cover lookups. Nothing
// under test reaches it, but the real module pulls in the database pool.
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

// Pinned to the window path. crossReferenceWithROMM consults the library index
// first and only falls back to the 2000-window when the index reports
// indexBuilding, so without this the test below asserts against whichever path
// the machine running the suite happens to offer: no reachable Postgres and it
// takes the window, a reachable one and it silently starts reading a real
// index instead. That is not a flake, it is the test quietly measuring
// something else -- verified by running this file against a populated
// database, where it returned a library_url built from a real indexed rom id
// rather than the mocked one. What this file is about is which *URL base* the
// link is built from, and that has to be true on both paths.
vi.mock("$lib/library/router.js", () => ({
  entriesByIgdbIds: vi.fn(async () => ({
    source: "none",
    indexBuilding: true,
    entries: [],
  })),
}));

const KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
  "ROMM_SERVER_URL",
  "ROMM_SERVER_URL_PUBLIC",
  "ROMM_API_TOKEN",
  "ROMM_USERNAME",
  "ROMM_PASSWORD",
  "LIBRARY_SYNC_ENABLED",
  "LIBRARY_SYNC_INTERVAL_MS",
  "LIBRARY_SYNC_BATCH",
  "LIBRARY_SYNC_MAX_SWEEP_RATIO",
];

/** A fresh romm.server.js: it caches the resolved configuration in module scope. */
async function rommServer() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("library configuration reaches the RomM client", () => {
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
    global.fetch = vi
      .fn()
      .mockResolvedValue(response(200, { items: [], total: 0 }));
  });

  it("treats a LIBRARY_*-only configuration as configured", async () => {
    // The exact failure: .env.example told operators to set these names, and
    // isRommConfigured() only ever looked at ROMM_*.
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("accepts LIBRARY_USERNAME and LIBRARY_PASSWORD as the credential", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_USERNAME = "user";
    process.env.LIBRARY_PASSWORD = "pass";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("still treats a ROMM_*-only configuration as configured", async () => {
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("is unconfigured when neither naming is present", async () => {
    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(false);
  });

  it("is unconfigured with a url but no credential, under either naming", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(false);
  });

  it("sends library requests to LIBRARY_URL, bearing LIBRARY_API_TOKEN", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain("http://library.test:8080/api/roms");
    expect(init.headers.Authorization).toBe("Bearer rmm_library_token");
  });

  it("sends library requests to ROMM_SERVER_URL when LIBRARY_URL is unset", async () => {
    // Zero behaviour change for an existing install is the whole point of the
    // fallback: this is the same assertion as above with the old names.
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain("http://romm.test/api/roms");
    expect(init.headers.Authorization).toBe("Bearer rmm_romm_token");
  });

  it("prefers LIBRARY_URL over ROMM_SERVER_URL when both are set", async () => {
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    expect(String(global.fetch.mock.calls[0][0])).toContain(
      "http://library.test:8080/api/roms",
    );
  });

  it("uses LIBRARY_PUBLIC_URL for the browser-facing link base", async () => {
    // library_url is rendered as an href, so it must come from the public
    // name, not the internal one.
    process.env.LIBRARY_URL = "http://library.internal:8080";
    process.env.LIBRARY_PUBLIC_URL = "https://library.example.com";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";
    global.fetch = vi.fn().mockResolvedValue(
      response(200, {
        items: [{ id: 7, name: "Chrono Trigger", igdb_id: 1721 }],
        total: 1,
      }),
    );

    const { crossReferenceWithROMM } = await rommServer();
    const [game] = await crossReferenceWithROMM([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.library_url).toBe("https://library.example.com/rom/7");
  });
});

/**
 * The index sync settings.
 *
 * These existed nowhere at all until the sync was wired into init(): the code
 * that fills ggr_library_entries had no caller and no configuration, so the
 * index could never become ready. The default matters most -- an existing
 * install must not start walking its whole library on a timer because it
 * upgraded.
 */
describe("library sync settings", () => {
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  async function config() {
    vi.resetModules();
    const { resolveLibraryConfig } = await import(
      "../../src/lib/library/config.js"
    );
    return resolveLibraryConfig();
  }

  it("leaves the sync off, with usable defaults, when nothing is set", async () => {
    const resolved = await config();

    expect(resolved.syncEnabled).toBe(false);
    expect(resolved.syncIntervalMs).toBe(900000);
    expect(resolved.syncBatchSize).toBe(500);
  });

  it("enables the sync only for the literal string true", async () => {
    process.env.LIBRARY_SYNC_ENABLED = "true";
    expect((await config()).syncEnabled).toBe(true);
  });

  it("treats every other value as off, including a truthy 'false'", async () => {
    // Any non-empty string is truthy, so coercing rather than comparing would
    // have made LIBRARY_SYNC_ENABLED=false enable it.
    for (const value of ["false", "0", "yes", "TRUE", "1"]) {
      process.env.LIBRARY_SYNC_ENABLED = value;
      expect((await config()).syncEnabled).toBe(false);
    }
  });

  it("reads the interval and batch size", async () => {
    process.env.LIBRARY_SYNC_INTERVAL_MS = "60000";
    process.env.LIBRARY_SYNC_BATCH = "100";

    const resolved = await config();

    expect(resolved.syncIntervalMs).toBe(60000);
    expect(resolved.syncBatchSize).toBe(100);
  });

  it("falls back rather than accepting zero or nonsense", async () => {
    // 0ms is a hot loop and a batch of 0 is a walk that never advances.
    process.env.LIBRARY_SYNC_INTERVAL_MS = "0";
    process.env.LIBRARY_SYNC_BATCH = "fifteen";

    const resolved = await config();

    expect(resolved.syncIntervalMs).toBe(900000);
    expect(resolved.syncBatchSize).toBe(500);
  });

  it("defaults the sweep ceiling to half the live index", async () => {
    expect((await config()).syncMaxSweepRatio).toBe(0.5);
  });

  it("reads a fractional sweep ceiling", async () => {
    process.env.LIBRARY_SYNC_MAX_SWEEP_RATIO = "0.05";
    expect((await config()).syncMaxSweepRatio).toBe(0.05);
  });

  it("accepts 1, which is the way to turn the guard off", async () => {
    // Nothing can exceed the whole of the live index, so the guard can never
    // trip. That is the escape hatch for a library that really is replaced
    // wholesale.
    process.env.LIBRARY_SYNC_MAX_SWEEP_RATIO = "1";
    expect((await config()).syncMaxSweepRatio).toBe(1);
  });

  it("falls back on a ratio outside (0, 1] or on nonsense", async () => {
    // 0 is rejected rather than read as "never sweep": it makes any removal at
    // all trip the guard, which is what a typo looks like, not a setting.
    for (const value of ["0", "-0.5", "1.5", "50%", "half", ""]) {
      process.env.LIBRARY_SYNC_MAX_SWEEP_RATIO = value;
      expect((await config()).syncMaxSweepRatio).toBe(0.5);
    }
  });
});
