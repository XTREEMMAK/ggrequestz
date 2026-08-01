/**
 * Regression tests for cross-referencing against the local index (issue #19).
 *
 * The old implementation asked RomM for the 2000 most recently added roms and
 * decided membership from that window. On a 72,162-rom library that is wrong
 * for about 97 percent of it: a game that is demonstrably present reports
 * `in_library: false`.
 *
 * Both paths are pinned here, because both still run. The index answers once a
 * sync has completed; the window answers until then, and LIBRARY_SYNC_ENABLED
 * defaults to false, so the window is what a default install still gets. A
 * change that made the index path work and quietly broke the fallback would
 * regress every install that has not opted in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const entriesByIgdbIds = vi.fn();

vi.mock("$lib/library/router.js", () => ({ entriesByIgdbIds }));
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

/**
 * One index row, in the seam's vocabulary.
 *
 * id is a string and igdbId is a string, because the index columns are TEXT --
 * LibraryEntry stringifies both for every backend. That is the whole reason
 * library_id is specified as a string.
 */
const ENTRY = {
  id: "58231",
  name: "Chrono Trigger",
  platformName: "Super Nintendo",
  igdbId: "1721",
  sizeBytes: null,
  addedAt: null,
  coverUrl: null,
  path: null,
};

/** The same game as RomM's /roms returns it, for the window fallback. */
const ROM = {
  id: 58231,
  name: "Chrono Trigger",
  igdb_id: 1721,
  platform_display_name: "Super Nintendo",
};

// LIBRARY_URL wins over ROMM_SERVER_URL in resolveLibraryConfig()'s read()
// order, so a developer with it exported would otherwise silently override the
// ROMM_SERVER_URL set below.
const LIBRARY_ENV_KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
];

/** The index has completed a sync and holds these entries. */
function indexHolds(entries) {
  entriesByIgdbIds.mockResolvedValue({
    source: "index",
    indexBuilding: false,
    entries,
  });
}

/** No sync has ever completed, so the index cannot answer at all. */
function indexIsBuilding() {
  entriesByIgdbIds.mockResolvedValue({
    source: "none",
    indexBuilding: true,
    entries: [],
  });
}

/** RomM answers every request with these items. */
function rommAnswers(items) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ items, total: items.length }),
    text: async () => "",
  });
}

function configure() {
  for (const key of LIBRARY_ENV_KEYS) delete process.env[key];
  process.env.ROMM_SERVER_URL = "http://romm.test";
  process.env.ROMM_SERVER_URL_PUBLIC = "https://romm.example.com";
  process.env.ROMM_API_TOKEN = "rmm_token";
}

async function rommServer() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

async function crossReference(games) {
  const mod = await rommServer();
  return mod.crossReferenceWithROMM(games);
}

/** Every URL fetch was called with, as strings. */
function fetchedUrls() {
  return global.fetch.mock.calls.map(([url]) => String(url));
}

describe("cross-reference through the index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configure();
    // RomM's window does NOT contain this rom -- that is the bug being fixed,
    // and it is also what keeps these assertions honest. With the same rom in
    // both fixtures, every one of them would pass against the old
    // implementation and prove nothing.
    rommAnswers([]);
    indexHolds([ENTRY]);
  });

  it("finds a game the newest-2000 window would have missed", async () => {
    // The point of the whole change. This rom is at id 58231 in a 72,162-rom
    // library and has not been touched in months, so it is nowhere near the
    // 2000 most recently added.
    const [game] = await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("58231");
    expect(game.library_url).toBe("https://romm.example.com/rom/58231");
    expect(game.platform_name).toBe("Super Nintendo");
  });

  it("asks the index for the ids instead of fetching a window", async () => {
    await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
      { igdb_id: "2000", title: "Somebody Else" },
    ]);

    expect(entriesByIgdbIds).toHaveBeenCalledWith(["1721", "2000"]);
    // No outbound RomM call at all. The window cost one /roms request per
    // render, on /game/[id] and the homepage both.
    expect(fetchedUrls().filter((url) => url.includes("/roms"))).toEqual([]);
  });

  it("matches a numeric igdb_id, which the window path never did", async () => {
    // The window keyed its map with rom.igdb_id.toString() and looked up with
    // the raw game.igdb_id, so a number from IGDB missed a string key every
    // time. Recorded in issue #19 as its own defect.
    const [game] = await crossReference([
      { igdb_id: 1721, title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("58231");
  });

  it("keeps library_id a string and romm_id a number", async () => {
    const [game] = await crossReference([
      { igdb_id: 1721, title: "Chrono Trigger" },
    ]);

    // Deliberately NOT identical. library_id is the stable name and follows
    // LibraryEntry.id, which is a string for every backend because the index
    // column is TEXT. romm_id is the deprecated alias and RomM has always put
    // a number there, so a component comparing it with === must keep working.
    // Do not "fix" these two to match.
    expect(game.library_id).toBe("58231");
    expect(game.romm_id).toBe(58231);
    expect(typeof game.library_id).toBe("string");
    expect(typeof game.romm_id).toBe("number");
    expect(game.romm_id).not.toBe(game.library_id);
  });

  it("keeps the deprecated aliases carrying the same values", async () => {
    const [game] = await crossReference([
      { igdb_id: 1721, title: "Chrono Trigger" },
    ]);

    // Concrete values, not just "equal to the neutral name". Both undefined
    // would satisfy an equality assertion and mean nothing.
    expect(game.is_in_romm).toBe(true);
    expect(game.romm_url).toBe("https://romm.example.com/rom/58231");
    expect(game.is_in_romm).toBe(game.in_library);
    expect(game.romm_url).toBe(game.library_url);
  });

  it("hands back a non-numeric library id as the string it is", async () => {
    // Retrom and Gaseous ids are not RomM's integers. Number("abc") is NaN,
    // and a NaN in romm_id is worse than a string: it compares false against
    // everything including itself.
    indexHolds([{ ...ENTRY, id: "b3f1-9c2e" }]);

    const [game] = await crossReference([{ igdb_id: 1721, title: "x" }]);

    expect(game.library_id).toBe("b3f1-9c2e");
    expect(game.romm_id).toBe("b3f1-9c2e");
    expect(Number.isNaN(game.romm_id)).toBe(false);
  });

  it("picks the same rom every time when two share an igdb id", async () => {
    // The same game on two platforms is two roms under one igdb_id, and only
    // one of them can be library_id. The index read has no ORDER BY, so
    // whichever row Postgres happens to return last would win -- and the badge
    // would point at a different platform's rom between two loads of the same
    // page.
    const snes = { ...ENTRY, id: "58231", platformName: "Super Nintendo" };
    const psx = { ...ENTRY, id: "10422", platformName: "PlayStation" };

    const [first] = await crossReference([{ igdb_id: 1721, title: "x" }]);
    indexHolds([psx, snes]);
    const [second] = await crossReference([{ igdb_id: 1721, title: "x" }]);
    indexHolds([snes, psx]);
    const [third] = await crossReference([{ igdb_id: 1721, title: "x" }]);

    expect(second.library_id).toBe(third.library_id);
    expect(first.library_id).toBe("58231");
    expect(second.library_id).toBe("10422");
  });

  it("annotates nothing for an empty batch, without reaching RomM", async () => {
    // The window path fetched 2000 roms to answer a question about no games.
    const games = await crossReference([]);

    expect(games).toEqual([]);
    expect(entriesByIgdbIds).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports a game the index does not hold as absent, under both names", async () => {
    indexHolds([]);

    const [game] = await crossReference([
      { igdb_id: 999999, title: "Not Here" },
    ]);

    expect(game.in_library).toBe(false);
    expect(game.is_in_romm).toBe(false);
  });

  it("does not match on title, so two games sharing one cannot collide", async () => {
    // The window keyed its map by lowercased name as well as by igdb_id, so
    // two different games with the same title overwrote each other and the
    // last one won -- issue #19's second defect. An id match is either right
    // or absent.
    //
    // The index holds a rom named "Chrono Trigger" at igdb 1721. This is a
    // *different* game that happens to share the title, so a lookup that falls
    // back to the name would claim it is in the library.
    const [game] = await crossReference([
      { igdb_id: 424242, title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(false);
    expect(game.library_id).toBeUndefined();
  });

  it("still answers when RomM itself is unreachable", async () => {
    // The index read touches Postgres and nothing else. Blanking every badge
    // because the backend is down is exactly what having an index is for.
    const mod = await rommServer();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
      text: async () => "no such endpoint",
    });
    await mod.probeRommAvailability();
    global.fetch.mockClear();

    const [game] = await mod.crossReferenceWithROMM([
      { igdb_id: 1721, title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("cross-reference while the index is still building", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configure();
    rommAnswers([ROM]);
    indexIsBuilding();
  });

  it("falls back to the 2000-window, which is all an unsynced install has", async () => {
    // LIBRARY_SYNC_ENABLED defaults to false. Swapping the implementations
    // outright would make every game on a default install report
    // not-in-library, which is worse than the bug being fixed.
    const [game] = await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("58231");
    expect(game.romm_id).toBe(58231);

    const windows = fetchedUrls().filter((url) => url.includes("limit=2000"));
    expect(windows).toHaveLength(1);
    expect(windows[0]).toContain("order_by=created_at");
    expect(windows[0]).toContain("order_dir=desc");
  });

  it("stringifies the igdb id on lookup here too", async () => {
    // Cheap, independent of the index, and recorded in issue #19: the window
    // stringified on insert and not on read, so a numeric id never matched.
    // Leaving a known-wrong lookup in the retained path is not "keeping it".
    //
    // The title deliberately does not match the rom's name, so the map's name
    // key cannot rescue the lookup and hide the id-type miss -- which is
    // exactly how this defect stayed invisible.
    const [game] = await crossReference([
      { igdb_id: 1721, title: "Chrono Trigger (USA) [!]" },
    ]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("58231");
  });

  it("still reaches the window for a batch carrying no igdb id at all", async () => {
    // The router short-circuits an empty id set, and it used to do that before
    // checking whether a sync had ever completed -- so a batch with no usable
    // igdb_id got `indexBuilding: false` from an index that had never been
    // built, and every game in it was reported absent. Here the router
    // reports the truth, and the window is reached and matches on title, which
    // is the only key left when there is no id.
    const [game] = await crossReference([{ title: "Chrono Trigger" }]);

    expect(game.in_library).toBe(true);
    expect(game.library_id).toBe("58231");
    expect(fetchedUrls().some((url) => url.includes("limit=2000"))).toBe(true);
  });

  it("falls back when the index read throws rather than blanking every badge", async () => {
    entriesByIgdbIds.mockRejectedValue(new Error("connection terminated"));

    const [game] = await crossReference([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBe(true);
    expect(fetchedUrls().some((url) => url.includes("limit=2000"))).toBe(true);
  });

  it("does not reach RomM at all while it is known to be down", async () => {
    // Unchanged from before the index existed: the window path costs a round
    // trip, so a known-bad snapshot short-circuits it.
    const mod = await rommServer();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
      text: async () => "no such endpoint",
    });
    await mod.probeRommAvailability();
    global.fetch.mockClear();

    const [game] = await mod.crossReferenceWithROMM([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.in_library).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
