/**
 * Regression tests for the shape of the /roms query this client sends.
 *
 * ROMM computes two aggregates for every /roms call unless told otherwise: the
 * A-Z jump index (`char_index`) and the facet lists behind its filter sidebar
 * (`filter_values`). Both aggregate over the whole roms table, so `limit`
 * cannot make them cheaper. Nothing here reads either -- every caller
 * destructures `items` and `total`.
 *
 * On a 72,162-rom library the availability probe took 30.5s warm with them and
 * 2.3s without, which against the per-attempt timeout is the difference between
 * a working integration and a permanent "ROMM is unreachable": a timed-out
 * probe trips the availability breaker, and that is indistinguishable from the
 * service being down.
 *
 * These pin the opt-out, and that it stays confined to the collection endpoint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// romm.server.js imports this at module scope for IGDB cover lookups. Nothing
// under test reaches it, but the real module pulls in the database pool.
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

const ROMM_URL = "http://romm.test";

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** URLs passed to fetch, in order. */
function calledUrls() {
  return global.fetch.mock.calls.map(([url]) => String(url));
}

/** The query string of the /roms collection call, parsed. */
function romsQuery() {
  const url = calledUrls().find((candidate) =>
    candidate.startsWith(`${ROMM_URL}/api/roms?`),
  );
  expect(url, "expected a /roms call").toBeDefined();
  return new URL(url).searchParams;
}

/** Import a pristine copy; token and availability state are module-scoped. */
async function freshRomm() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

describe("ROMM /roms query shape", () => {
  beforeEach(() => {
    process.env.ROMM_SERVER_URL = ROMM_URL;
    process.env.ROMM_API_TOKEN = "rmm_static_token";
    delete process.env.ROMM_USERNAME;
    delete process.env.ROMM_PASSWORD;
    global.fetch = vi
      .fn()
      .mockResolvedValue(response(200, { items: [], total: 0 }));
  });

  it("opts the availability probe out of both aggregates", async () => {
    const { probeRommAvailability } = await freshRomm();

    await probeRommAvailability();

    const query = romsQuery();
    expect(query.get("with_char_index")).toBe("false");
    expect(query.get("with_filter_values")).toBe("false");
  });

  it("keeps the parameters the caller asked for", async () => {
    const { probeRommAvailability } = await freshRomm();

    await probeRommAvailability();

    const query = romsQuery();
    expect(query.get("group_by_meta_id")).toBe("false");
    expect(query.get("limit")).toBe("1");
    expect(query.get("offset")).toBe("0");
  });

  it("opts the library listing out too, not just the probe", async () => {
    const { getRecentlyAddedROMs } = await freshRomm();

    await getRecentlyAddedROMs(16, 0);

    const query = romsQuery();
    expect(query.get("with_char_index")).toBe("false");
    expect(query.get("with_filter_values")).toBe("false");
    // The listing's own ordering has to survive the rewrite.
    expect(query.get("order_by")).toBe("created_at");
    expect(query.get("order_dir")).toBe("desc");
  });

  it("opts search out too, without disturbing its ordering", async () => {
    const { searchROMs } = await freshRomm();

    await searchROMs("chrono trigger");

    const query = romsQuery();
    expect(query.get("with_char_index")).toBe("false");
    expect(query.get("with_filter_values")).toBe("false");
    expect(query.get("search_term")).toBe("chrono trigger");
    // ROMM's default ordering is what makes search results relevant, so the
    // opt-out must not smuggle in an order_by.
    expect(query.has("order_by")).toBe(false);
  });

  it("leaves a single-ROM fetch alone, which has no aggregates to skip", async () => {
    // This one gets a ROM-shaped body, since it formats what it receives.
    global.fetch = vi
      .fn()
      .mockResolvedValue(response(200, { id: "123", name: "Chrono Trigger" }));
    const { getROMById } = await freshRomm();

    await getROMById("123");

    const url = calledUrls().find((candidate) =>
      candidate.includes("/api/roms/123"),
    );
    expect(url).toBe(`${ROMM_URL}/api/roms/123`);
  });

  it("leaves endpoints that are not /roms alone", async () => {
    const { getPlatforms } = await freshRomm();

    await getPlatforms();

    const url = calledUrls().find((candidate) =>
      candidate.includes("/platforms"),
    );
    expect(url).toBe(`${ROMM_URL}/api/platforms`);
  });
});
