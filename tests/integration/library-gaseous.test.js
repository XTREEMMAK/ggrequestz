/**
 * Regression tests for the Gaseous backend.
 *
 * Gaseous has no server module to delegate to, so the transport is injected
 * rather than mocked at the module boundary: `createGaseousLibrary` takes a
 * `fetch`, and every test here drives it with canned responses. The shapes
 * below are not invented -- each one is a real response recorded from a live
 * gaseous-server 2.0.0-rc.3 during the discovery that produced this backend.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGaseousLibrary,
  assertCapability,
} from "$lib/library/gaseous.js";
import { CAPABILITIES, CapabilityUnsupported } from "$lib/library/types.js";

/** A Response-alike, with the getSetCookie() the cookie reader prefers. */
function reply(body, { status = 200, cookies = [] } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      getSetCookie: () => cookies,
      get: () => (cookies.length ? cookies[0] : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const LOGIN_OK = reply(
  { success: true },
  { cookies: ["Gaseous.Identity=abc123; path=/; samesite=lax; httponly"] },
);

/** GET /Platforms, trimmed to the fields the backend reads. */
const PLATFORMS = reply([
  { id: 0, name: "Unknown Platform", slug: "unknown" },
  { id: 18, name: "Nintendo Entertainment System", slug: "nes" },
  { id: 7, name: "PlayStation", slug: "ps" },
]);

/** A MinimalGameItem exactly as the live server returned one. */
function game(overrides = {}) {
  return {
    platformIds: [18],
    id: 1,
    metadataMapId: 1,
    metadataSource: "None",
    index: 0,
    alpha: "P",
    name: "proofseed",
    nameThe: "proofseed",
    hasSavedGame: false,
    isFavourite: false,
    genres: [],
    themes: [],
    players: [],
    perspectives: [],
    cover: 0,
    ageRatings: [],
    ...overrides,
  };
}

/**
 * A transport that answers login and /Platforms, then plays out `pages` for
 * successive POST /Games calls.
 */
function transportFor(pages) {
  const calls = [];
  let page = 0;

  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, init });

    if (url.includes("/Account/Login")) return LOGIN_OK;
    if (url.includes("/Platforms")) return PLATFORMS;
    if (url.includes("/Games?")) {
      const games = pages[page] ?? [];
      page += 1;
      return reply({ games, count: 99999 });
    }
    return reply({}, { status: 404 });
  });

  return { fetch, calls };
}

function backend(fetch) {
  return createGaseousLibrary({
    kind: "gaseous",
    url: "http://gaseous.test/",
    username: "proof@proof.invalid",
    password: "Proofproof1!",
    fetch,
  });
}

/** The parsed POST /Games body of the nth listing call. */
function listingBody(calls, n = 0) {
  const listing = calls.filter((c) => c.url.includes("/Games?"));
  return JSON.parse(listing[n].init.body);
}

/** The query string of the nth listing call. */
function listingParams(calls, n = 0) {
  const listing = calls.filter((c) => c.url.includes("/Games?"));
  return new URL(listing[n].url).searchParams;
}

describe("Gaseous library backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports its kind", () => {
    expect(backend(transportFor([]).fetch).kind()).toBe("gaseous");
  });

  it("declares exactly the five capabilities proved against the instance", () => {
    const capabilities = backend(transportFor([]).fetch).capabilities();

    expect([...capabilities].sort()).toEqual(
      ["GET_BY_ID", "LIST_PLATFORMS", "LIST_RECENT", "SEARCH", "SYNC"].sort(),
    );
  });

  it("hands out a copy, so a caller cannot mutate the backend's set", () => {
    // Object.freeze on a Set leaves `add` working, so freezing is not a
    // defence. A copy per call is.
    const library = backend(transportFor([]).fetch);
    library.capabilities().add("NOPE");

    expect(library.capabilities().has("NOPE")).toBe(false);
  });

  it("throws CapabilityUnsupported naming the kind and the capability", () => {
    // Gaseous declares every capability, so this guard has no reachable path
    // in production. It is exercised directly rather than left unproven: the
    // contract says a backend asked for a mode it does not declare must throw
    // this, not omit the method and yield "is not a function".
    let thrown;
    try {
      assertCapability([CAPABILITIES.SYNC], CAPABILITIES.SEARCH);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CapabilityUnsupported);
    expect(thrown.kind).toBe("gaseous");
    expect(thrown.capability).toBe("SEARCH");
    expect(thrown.message).toBe("gaseous does not support SEARCH");
  });

  it("logs in once and reuses the identity cookie", async () => {
    const { fetch, calls } = transportFor([[game()]]);
    const library = backend(fetch);

    await library.listEntries({ limit: 24 });
    await library.listEntries({ limit: 24 });

    const logins = calls.filter((c) => c.url.includes("/Account/Login"));
    expect(logins).toHaveLength(1);

    const listing = calls.filter((c) => c.url.includes("/Games?"));
    expect(listing[0].init.headers.Cookie).toBe("Gaseous.Identity=abc123");
  });

  it("re-authenticates once when the cookie is rejected", async () => {
    // Gaseous can expire a session at any time and the only way it surfaces is
    // the next call failing. 2.0 answers 401 for that; 1.7.x answers 302.
    let games = 0;
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      games += 1;
      return games === 1
        ? reply({}, { status: 401 })
        : reply({ games: [game()] });
    });

    const entries = await backend(fetch).listEntries({ limit: 24 });

    expect(entries).toHaveLength(1);
    const logins = fetch.mock.calls.filter((c) =>
      c[0].includes("/Account/Login"),
    );
    expect(logins).toHaveLength(2);
  });

  it("treats a 302 as not-authenticated, which is how 1.7.x says 401", async () => {
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      return reply({}, { status: 302 });
    });

    await expect(backend(fetch).listEntries({ limit: 24 })).rejects.toThrow(
      /not authenticated/i,
    );
  });

  it("never follows a redirect, so a login page cannot be parsed as JSON", async () => {
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ limit: 24 });

    for (const call of calls) {
      expect(call.init.redirect).toBe("manual");
    }
  });

  it("normalises a game into LibraryEntry shape", async () => {
    const { fetch } = transportFor([[game()]]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    // The id is metadataMapId, not id: it is MetadataMap's primary key and it
    // is what GET /Games/{MetadataMapId} takes.
    expect(entry.id).toBe("1");
    expect(entry.name).toBe("proofseed");
    expect(entry.platformName).toBe("Nintendo Entertainment System");
    // Absent from the API on a game, all three. See the module header.
    expect(entry.sizeBytes).toBeNull();
    expect(entry.addedAt).toBeNull();
    expect(entry.coverUrl).toBeNull();
    expect(entry.path).toBeNull();
  });

  it("keys the entry on metadataMapId even when it differs from id", async () => {
    const { fetch } = transportFor([
      [game({ id: 1721, metadataMapId: 42, metadataSource: "IGDB" })],
    ]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    expect(entry.id).toBe("42");
  });

  it("emits an igdbId only when the metadata source is IGDB", async () => {
    // The single most consequential mapping in the backend. `id` is the game's
    // id *in whatever source matched it* -- MetadataMapBridge keys on
    // (ParentMapId, MetadataSourceType, MetadataSourceId) and `id` is the last
    // of those. A "None"-sourced game with id 1 is not IGDB game 1.
    const { fetch } = transportFor([
      [game({ id: 1721, metadataSource: "IGDB" })],
    ]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    expect(entry.igdbId).toBe("1721");
  });

  it("refuses to invent an igdbId for a locally-sourced game", async () => {
    const { fetch } = transportFor([[game({ id: 1, metadataSource: "None" })]]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    // Emitting "1" here would cross-reference this ROM against IGDB game 1,
    // silently, in the one field the index exists to join on.
    expect(entry.igdbId).toBeNull();
  });

  it("fails closed on a metadata source it does not recognise", async () => {
    const { fetch } = transportFor([
      [game({ id: 900, metadataSource: "TheGamesDb" })],
    ]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    expect(entry.igdbId).toBeNull();
  });

  it("orders by DateAdded descending for a recent listing", async () => {
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ limit: 5 });

    const body = listingBody(calls);
    expect(body.Sorting.SortBy).toBe("DateAdded");
    expect(body.Sorting.SortAscending).toBe(false);
    expect(body.Name).toBe("");
  });

  it("sends the search term as Name, with a sort Gaseous will accept", async () => {
    // Sorting is required: POST /Games with no Sorting is a 400, so there is
    // no "leave the ordering alone" to express for a relevance listing.
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ search: "metroid", order: "relevance" });

    const body = listingBody(calls);
    expect(body.Name).toBe("metroid");
    expect(body.Sorting.SortBy).toBe("NameThe");
    expect(body.Sorting.SortAscending).toBe(true);
  });

  it("sends the filter body both API generations accept", async () => {
    // 2.0 requires Name and Sorting; 1.7.x additionally requires Platform,
    // Genre, GameMode, PlayerPerspective and Theme, and an explicit null fails
    // its validation exactly as an absent key does.
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ limit: 24 });

    const body = listingBody(calls);
    for (const field of [
      "Platform",
      "Genre",
      "GameMode",
      "PlayerPerspective",
      "Theme",
    ]) {
      expect(body[field]).toEqual([]);
    }
  });

  it("asks for page 1 first, because there is no page 0 on 2.0", async () => {
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ limit: 24, offset: 0 });

    expect(listingParams(calls).get("pageNumber")).toBe("1");
    expect(listingParams(calls).get("pageSize")).toBe("24");
  });

  it("turns an aligned offset into a page number", async () => {
    const { fetch, calls } = transportFor([[game()]]);

    await backend(fetch).listEntries({ limit: 24, offset: 48 });

    expect(listingParams(calls).get("pageNumber")).toBe("3");
    expect(listingParams(calls).get("pageSize")).toBe("24");
  });

  it("over-fetches and slices when an offset lands mid-page", async () => {
    // Gaseous has no offset, so a window that is not on a page boundary has no
    // page whose first row is the one asked for.
    const { fetch, calls } = transportFor([
      [
        game({ metadataMapId: 1, name: "a" }),
        game({ metadataMapId: 2, name: "b" }),
        game({ metadataMapId: 3, name: "c" }),
      ],
    ]);

    const entries = await backend(fetch).listEntries({ limit: 2, offset: 1 });

    expect(listingParams(calls).get("pageNumber")).toBe("1");
    expect(listingParams(calls).get("pageSize")).toBe("3");
    expect(entries.map((e) => e.name)).toEqual(["b", "c"]);
  });

  it("skips a malformed record instead of failing the whole page", async () => {
    // No metadataMapId, so there is no id to key the index on and
    // normalizeEntry refuses it. The good record either side must survive.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetch } = transportFor([
      [
        game({ metadataMapId: 1, name: "good" }),
        game({ metadataMapId: undefined, name: "no id" }),
        game({ metadataMapId: 3, name: "also good" }),
      ],
    ]);

    const entries = await backend(fetch).listEntries({ limit: 24 });

    expect(entries.map((e) => e.name)).toEqual(["good", "also good"]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping unusable Gaseous record:",
      "library entry has no id",
    );
    warn.mockRestore();
  });

  it("falls back to nameThe when name is empty", async () => {
    // Not a malformed record: Gaseous carries both, and nameThe is the
    // "The"-stripped sort name rather than a different title.
    const { fetch } = transportFor([
      [game({ metadataMapId: 5, name: "", nameThe: "Legend of Zelda, The" })],
    ]);

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    expect(entry.name).toBe("Legend of Zelda, The");
  });

  it("drops a record with no usable name at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetch } = transportFor([
      [game({ metadataMapId: 6, name: "", nameThe: "" })],
    ]);

    expect(await backend(fetch).listEntries({ limit: 24 })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping unusable Gaseous record:",
      "library entry has no name",
    );
    warn.mockRestore();
  });

  it("reads a missing games key as no results", async () => {
    // `games` is absent rather than empty when nothing matches.
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      return reply({ count: 0, alphaList: {} });
    });

    expect(await backend(fetch).listEntries({ limit: 24 })).toEqual([]);
  });

  it("hands the sync one batch per page and stops on a short page", async () => {
    const { fetch } = transportFor([
      [game({ metadataMapId: 1 }), game({ metadataMapId: 2 })],
      [game({ metadataMapId: 3 })],
    ]);

    const batches = [];
    await backend(fetch).syncEntries({
      batchSize: 2,
      onBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it("stops paging on an empty page, so a wrong count cannot loop forever", async () => {
    // Every canned page here reports count 99999, which is what the live
    // server's `count` field would look like if it disagreed with the pages.
    const { fetch } = transportFor([[game({ metadataMapId: 1 })], []]);

    const batches = [];
    await backend(fetch).syncEntries({
      batchSize: 1,
      onBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(1);
  });

  it("walks pages 1, 2, 3 and never asks for page 0", async () => {
    const { fetch, calls } = transportFor([
      [game({ metadataMapId: 1 })],
      [game({ metadataMapId: 2 })],
      [],
    ]);

    await backend(fetch).syncEntries({ batchSize: 1, onBatch: () => {} });

    const pages = calls
      .filter((c) => c.url.includes("/Games?"))
      .map((c) => new URL(c.url).searchParams.get("pageNumber"));
    expect(pages).toEqual(["1", "2", "3"]);
  });

  it("never emits a duplicate id within one batch", async () => {
    // metadataMapId is MetadataMap's primary key, so this holds by
    // construction -- the assertion pins it, because a batch carrying a
    // duplicate makes the ON CONFLICT upsert raise "cannot affect row a
    // second time".
    const { fetch } = transportFor([
      [
        game({ metadataMapId: 1 }),
        game({ metadataMapId: 2 }),
        game({ metadataMapId: 3 }),
      ],
    ]);

    const batches = [];
    await backend(fetch).syncEntries({
      batchSize: 3,
      onBatch: (batch) => batches.push(batch),
    });

    const ids = batches[0].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists platforms", async () => {
    const { fetch } = transportFor([]);

    const platforms = await backend(fetch).listPlatforms();

    expect(platforms).toContainEqual({
      id: "18",
      name: "Nintendo Entertainment System",
    });
    expect(platforms.every((p) => typeof p.id === "string")).toBe(true);
  });

  it("fetches one game by its MetadataMapId", async () => {
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      // The detail record is a different shape from a listing record: it
      // carries no platformIds, which is why platformName is null here.
      return reply({
        sourceType: "None",
        metadataSource: "None",
        nameThe: "proofseed",
        metadataMapId: 1,
        cover: 0,
        id: 1,
        name: "proofseed",
      });
    });

    const entry = await backend(fetch).getEntry(1);

    expect(entry.id).toBe("1");
    expect(entry.name).toBe("proofseed");
    expect(entry.platformName).toBeNull();
  });

  it("returns null for a game that does not exist", async () => {
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      return reply({ status: 404, title: "Not Found" }, { status: 404 });
    });

    expect(await backend(fetch).getEntry(99)).toBeNull();
  });

  it("logs a malformed single record rather than returning a silent null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return PLATFORMS;
      return reply({ metadataMapId: 7, name: "" });
    });

    const entry = await backend(fetch).getEntry(7);

    expect(entry).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("survives a platform lookup that fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async (url) => {
      if (url.includes("/Account/Login")) return LOGIN_OK;
      if (url.includes("/Platforms")) return reply({}, { status: 500 });
      return reply({ games: [game()] });
    });

    const [entry] = await backend(fetch).listEntries({ limit: 24 });

    expect(entry.name).toBe("proofseed");
    expect(entry.platformName).toBeNull();
    warn.mockRestore();
  });

  it("probes by logging in, and reports why a probe failed", async () => {
    const ok = await backend(transportFor([]).fetch).probe();
    expect(ok.ok).toBe(true);

    const bad = await backend(
      vi.fn(async () => reply({ title: "Unauthorized" }, { status: 401 })),
    ).probe();
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(401);
    expect(bad.reason).toMatch(/credential/i);
  });

  it("says what is missing when it is not configured", async () => {
    const library = createGaseousLibrary({ kind: "gaseous", url: "" });

    const result = await library.probe();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/LIBRARY_URL/);
  });

  it("refuses a login that succeeds but demands a second factor", async () => {
    const fetch = vi.fn(async () => reply({ requiresTwoFactor: true }));

    const result = await backend(fetch).probe();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/two-factor/i);
  });
});
