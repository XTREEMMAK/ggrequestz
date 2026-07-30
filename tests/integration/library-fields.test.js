/**
 * Regression tests for the neutral library fields.
 *
 * is_in_romm, romm_id and romm_url are read by Svelte components, so they
 * are a client-visible contract and cannot simply be renamed. Neutral names
 * are added and the old ones kept as aliases, exactly as
 * REQUEST_WEBHOOK_URL kept N8N_WEBHOOK_URL.
 *
 * There are two producers of these fields, and both are covered here.
 * crossReferenceWithROMM annotates IGDB games; batchFormatROMData -- the shape
 * getRecentlyAddedROMs, searchROMs and getROMById return -- builds the
 * RomM-native cards. Both shapes reach the same components, which branch on
 * `game.is_romm_game || game.is_in_romm` and then read `game.romm_url`, so
 * covering only one of them left the neutral names half-true.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

const ROM = {
  id: 42,
  name: "Chrono Trigger",
  igdb_id: 1721,
  platform: { name: "Super Nintendo" },
};

async function rommServer() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

async function crossReference(games) {
  const mod = await rommServer();
  return mod.crossReferenceWithROMM(games);
}

// LIBRARY_URL wins over ROMM_SERVER_URL in resolveLibraryConfig()'s read()
// order. docker-compose.yml forwards LIBRARY_URL, so a developer with it
// exported would otherwise have ROMM_SERVER_URL below silently overridden.
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
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ items: [ROM], total: 1 }),
    text: async () => "",
  });
}

describe("cross-reference field names", () => {
  beforeEach(configure);

  it("sets the neutral fields on a match", async () => {
    const [game] = await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("42");
    expect(game.library_url).toContain("/rom/42");
  });

  it("keeps the deprecated names, and romm_id at its historical numeric type", async () => {
    const [game] = await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.is_in_romm).toBe(game.in_library);
    expect(game.romm_url).toBe(game.library_url);

    // Deliberately NOT identical, and this is the one place the neutral field
    // and its deprecated alias are supposed to differ. library_id is the
    // stable name: LibraryEntry.id is stringified and the local index's column
    // is TEXT, so if this stayed RomM's number it would silently change type
    // the moment cross-referencing became an index join -- a break in the very
    // field whose purpose is not to break. romm_id keeps the numeric type it
    // has always had. Do not "fix" these two to match.
    expect(game.library_id).toBe("42");
    expect(game.romm_id).toBe(42);
    expect(game.romm_id).not.toBe(game.library_id);
  });

  it("sets both names false on a miss", async () => {
    const [game] = await crossReference([
      { igdb_id: "999999", title: "Not Here" },
    ]);

    expect(game.in_library).toBe(false);
    expect(game.is_in_romm).toBe(false);
  });
});

describe("RomM-native card field names", () => {
  beforeEach(configure);

  it("sets the neutral fields alongside the deprecated ones", async () => {
    const { getRecentlyAddedROMs } = await rommServer();

    const [game] = await getRecentlyAddedROMs(1, 0);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("42");
    expect(game.library_url).toBe("https://romm.example.com/rom/42");
    expect(game.is_library_game).toBe(true);
  });

  it("keeps romm_id, romm_url and is_romm_game as aliases", async () => {
    // is_romm_game is read in seven component branches. is_library_game exists
    // so that migrating them becomes possible at all; until then both are set.
    const { getRecentlyAddedROMs } = await rommServer();

    const [game] = await getRecentlyAddedROMs(1, 0);

    expect(game.romm_id).toBe(42);
    expect(game.romm_url).toBe(game.library_url);
    expect(game.is_romm_game).toBe(game.is_library_game);
  });

  it("stringifies library_id here too, so one producer cannot disagree with the other", async () => {
    const { getRecentlyAddedROMs } = await rommServer();

    const [game] = await getRecentlyAddedROMs(1, 0);

    expect(typeof game.library_id).toBe("string");
    expect(typeof game.romm_id).toBe("number");
  });
});
