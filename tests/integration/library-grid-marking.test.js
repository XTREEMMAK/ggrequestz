/**
 * Tests for marking library games in grids (issue #31).
 *
 * Search results and the profile watchlist were never looked up against the
 * library, so their cards could not say anything true about it. They now use
 * markLibraryGames, which reads the local index and nothing else: unlike
 * crossReferenceWithROMM, it must never fall back to fetching from the library
 * on a render path.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const entriesByIgdbIds = vi.fn();

vi.mock("$lib/library/router.js", () => ({ entriesByIgdbIds }));
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

const ENTRY = {
  id: "58231",
  name: "Pokemon Ruby",
  platformName: "Game Boy Advance",
  igdbId: "1517",
};

const LIBRARY_ENV_KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
];

function configure() {
  for (const key of LIBRARY_ENV_KEYS) delete process.env[key];
  process.env.ROMM_SERVER_URL = "http://romm.test";
  process.env.ROMM_SERVER_URL_PUBLIC = "https://romm.example.com";
  process.env.ROMM_API_TOKEN = "rmm_token";
}

async function mark(games) {
  vi.resetModules();
  const { markLibraryGames } = await import("../../src/lib/romm.server.js");
  return markLibraryGames(games);
}

const RUBY = { igdb_id: "1517", title: "Pokemon Ruby" };
const TACTICS = { igdb_id: 9999, title: "Pokemon Tactics" };

beforeEach(() => {
  vi.clearAllMocks();
  configure();
  global.fetch = vi.fn(async () => {
    throw new Error("markLibraryGames must not reach the library");
  });
});

describe("markLibraryGames", () => {
  it("marks games the index holds, and marks the rest absent (the reported pair)", async () => {
    entriesByIgdbIds.mockResolvedValue({
      source: "index",
      indexBuilding: false,
      entries: [ENTRY],
    });

    const [ruby, tactics] = await mark([RUBY, TACTICS]);

    expect(ruby.in_library).toBe(true);
    expect(ruby.library_url).toBe("https://romm.example.com/rom/58231");
    expect(tactics.in_library).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("leaves games unmarked, without asking the library, while the index cannot answer", async () => {
    entriesByIgdbIds.mockResolvedValue({
      source: "none",
      indexBuilding: true,
      entries: [],
    });

    const games = await mark([RUBY, TACTICS]);

    expect(games.map((game) => game.in_library)).toEqual([
      undefined,
      undefined,
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("leaves games unmarked when the index read fails", async () => {
    entriesByIgdbIds.mockRejectedValue(new Error("database unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const games = await mark([RUBY]);

    expect(games[0].in_library).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves games untouched when no library is configured", async () => {
    for (const key of ["ROMM_SERVER_URL", "ROMM_API_TOKEN"]) {
      delete process.env[key];
    }

    const games = await mark([RUBY]);

    expect(games).toEqual([RUBY]);
    expect(entriesByIgdbIds).not.toHaveBeenCalled();
  });

  it("returns an empty list as it is", async () => {
    expect(await mark([])).toEqual([]);
    expect(entriesByIgdbIds).not.toHaveBeenCalled();
  });
});
