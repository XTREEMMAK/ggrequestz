/**
 * Regression tests for read routing.
 *
 * Index when it has completed a sync, backend when the index is empty and
 * the backend declares the capability, and an explicit indexBuilding state
 * when neither is possible. That third state exists because the alternative
 * is asserting an outage nobody observed, which is what issue 15 objected to.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async () => ({ rows: [] }));
const listEntries = vi.fn(async () => []);
let capabilities = new Set(["SYNC", "LIST_RECENT", "SEARCH", "GET_BY_ID"]);
let synced = false;

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/library/index.js", () => ({
  getLibrary: () => ({
    kind: () => "romm",
    capabilities: () => capabilities,
    listEntries,
  }),
}));

function stubQueries({ rows = [] } = {}) {
  query.mockImplementation(async (sql) => {
    if (sql.includes("ggr_library_sync_state")) {
      return { rows: synced ? [{ last_completed_at: new Date() }] : [] };
    }
    if (sql.includes("FROM ggr_library_entries")) return { rows };
    return { rows: [] };
  });
}

async function router() {
  vi.resetModules();
  return import("$lib/library/router.js");
}

describe("read routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capabilities = new Set(["SYNC", "LIST_RECENT", "SEARCH", "GET_BY_ID"]);
    synced = false;
    stubQueries();
  });

  it("reads the index once a sync has completed", async () => {
    synced = true;
    stubQueries({ rows: [{ library_id: "1", name: "a", igdb_id: "10" }] });
    const { recentEntries } = await router();

    const result = await recentEntries({ limit: 5, offset: 0 });

    expect(result.source).toBe("index");
    expect(listEntries).not.toHaveBeenCalled();
  });

  it("carries the removed_at predicate, or the partial indexes go unused", async () => {
    synced = true;
    const { recentEntries } = await router();

    await recentEntries({ limit: 5, offset: 0 });

    const read = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("FROM ggr_library_entries"));
    expect(read).toContain("removed_at IS NULL");
  });

  it("falls back to the backend when the index has never synced", async () => {
    const { recentEntries } = await router();

    const result = await recentEntries({ limit: 5, offset: 0 });

    expect(result.source).toBe("backend");
    expect(listEntries).toHaveBeenCalledTimes(1);
  });

  it("reports indexBuilding when the backend cannot list either", async () => {
    capabilities = new Set(["SYNC"]);
    const { recentEntries } = await router();

    const result = await recentEntries({ limit: 5, offset: 0 });

    expect(result.indexBuilding).toBe(true);
    expect(result.entries).toEqual([]);
    expect(listEntries).not.toHaveBeenCalled();
  });

  it("does not call a backend that cannot search", async () => {
    capabilities = new Set(["SYNC", "LIST_RECENT"]);
    const { searchEntries } = await router();

    const result = await searchEntries({
      search: "chrono",
      limit: 5,
      offset: 0,
    });

    expect(result.indexBuilding).toBe(true);
    expect(listEntries).not.toHaveBeenCalled();
  });

  it("orders by the backend timestamp when it has one, ours when it does not", async () => {
    synced = true;
    const { recentEntries } = await router();

    await recentEntries({ limit: 5, offset: 0 });

    const read = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("FROM ggr_library_entries"));
    expect(read).toContain("COALESCE(added_at, first_seen_at)");
  });

  it("looks up many igdb ids in one query, not one each", async () => {
    synced = true;
    stubQueries({ rows: [{ library_id: "1", name: "a", igdb_id: "10" }] });
    const { entriesByIgdbIds } = await router();

    await entriesByIgdbIds(["10", "11", "12"]);

    const reads = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes("FROM ggr_library_entries"));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("= ANY(");
  });

  it("returns an empty map for no ids without querying", async () => {
    synced = true;
    const { entriesByIgdbIds } = await router();

    const result = await entriesByIgdbIds([]);

    expect(result.entries).toEqual([]);
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes("FROM ggr_library_entries"),
      ),
    ).toHaveLength(0);
  });

  it("stringifies igdb ids on lookup, which is the 2000-window bug's sibling", async () => {
    synced = true;
    stubQueries({ rows: [] });
    const { entriesByIgdbIds } = await router();

    await entriesByIgdbIds([1721]);

    const params = query.mock.calls.find(([sql]) =>
      sql.includes("FROM ggr_library_entries"),
    )[1];
    expect(params[1]).toEqual(["1721"]);
  });
});
