/**
 * Regression test for the homepage page data (GHSA-p5rp-p8jc-w4p4).
 *
 * The homepage load returned `cookieHeader: "session=<JWT>"`. Everything a
 * load returns is serialized into the page HTML and into __data.json, so the
 * HttpOnly session token of every OIDC user was readable by any script on the
 * page. Verified live against the test stack before the fix: the session
 * cookie value appeared once in `/` and once in `/__data.json`.
 *
 * This runs the real load with its data sources stubbed and checks that the
 * cookie value appears nowhere in what it returns, streamed part included.
 */

import { describe, expect, it, vi } from "vitest";

const SESSION_TOKEN = "eyJhbGciOiJIUzI1NiJ9.session-token-under-test.sig";
const getRecentlyAddedROMs = vi.fn(async () => []);

const passthrough = (fn) => fn();

vi.mock("$lib/gameCache.js", () => ({
  getRecentGames: vi.fn(async () => []),
  getPopularGames: vi.fn(async () => []),
  warmUpCache: vi.fn(async () => {}),
}));
vi.mock("$lib/igdb.js", () => ({
  getRecentGames: vi.fn(async () => []),
  getPopularGames: vi.fn(async () => []),
}));
vi.mock("$lib/userPreferences.js", () => ({
  getUserPreferences: vi.fn(async () => null),
}));
vi.mock("$lib/database.js", () => ({
  gameRequests: { getRecent: vi.fn(async () => []) },
  watchlist: { get: vi.fn(async () => []) },
  query: vi.fn(async () => ({ rows: [{ id: 3 }] })),
}));
vi.mock("$lib/romm.server.js", () => ({
  getRecentlyAddedROMs,
  isRommConfigured: vi.fn(async () => true),
  getRommAvailabilitySnapshot: vi.fn(() => ({ ok: true })),
  crossReferenceWithROMM: vi.fn(async (games) => games),
  describeRommError: vi.fn(() => ({})),
}));
vi.mock("$lib/cache.js", () => ({
  cachePopularGames: passthrough,
  cacheRecentGames: passthrough,
  cacheRommGames: passthrough,
  cacheGameRequests: passthrough,
  withCache: (_key, fn) => fn(),
  getCacheStats: vi.fn(() => ({})),
}));
vi.mock("$lib/globalFilters.js", () => ({
  getGlobalFilters: vi.fn(async () => ({ enabled: false })),
  mergeFiltersWithGlobal: (preferences) => preferences,
}));

describe("homepage load", () => {
  it("returns nothing that carries the session cookie", async () => {
    const { load } = await import("../../src/routes/+page.server.js");

    const data = await load({
      parent: async () => ({
        user: { sub: "provider-user", id: 3 },
        needsSetup: false,
      }),
      cookies: {
        get: (name) => (name === "session" ? SESSION_TOKEN : undefined),
      },
      url: new URL("http://localhost/"),
      depends: () => {},
    });

    const streamed = await data.newInLibraryStream;
    const serialized = JSON.stringify({
      ...data,
      newInLibraryStream: streamed,
    });

    expect(serialized).not.toContain(SESSION_TOKEN);
    expect(data).not.toHaveProperty("cookieHeader");
    for (const call of getRecentlyAddedROMs.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SESSION_TOKEN);
    }
  });
});
