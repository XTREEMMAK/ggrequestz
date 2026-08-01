/**
 * Regression tests for read routing.
 *
 * Index when it has completed a sync, backend when the index is empty and
 * the backend declares the capability, and an explicit indexBuilding state
 * when neither is possible. That third state exists because the alternative
 * is asserting an outage nobody observed, which is what issue 15 objected to.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIST_ORDERS } from "$lib/library/types.js";

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

  it("asks the backend for relevance ordering when a search falls back", async () => {
    const { searchEntries } = await router();

    const result = await searchEntries({
      search: "chrono",
      limit: 5,
      offset: 0,
    });

    // Omitting `order` means RECENT, which makes RomM put
    // order_by=created_at&order_dir=desc on a *search* and discard the
    // backend's own ranking. LIST_ORDERS exists so ordering is asked for
    // rather than inferred from the presence of a search term.
    expect(result.source).toBe("backend");
    expect(listEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "chrono",
        order: LIST_ORDERS.RELEVANCE,
      }),
    );
  });

  it("breaks the recency tie on library_id, or paging repeats rows", async () => {
    synced = true;
    const { recentEntries, searchEntries } = await router();

    await recentEntries({ limit: 5, offset: 0 });
    await searchEntries({ search: "chrono", limit: 5, offset: 0 });

    const reads = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes("FROM ggr_library_entries"));
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      // first_seen_at defaults to NOW(), which is the transaction timestamp, so
      // every row of one unnest batch shares a single value. For a backend with
      // no added_at that leaves roughly one distinct sort key per batch, and
      // LIMIT/OFFSET over a non-deterministic order repeats and skips entries
      // between page loads.
      expect(read).toContain(
        "COALESCE(added_at, first_seen_at) DESC, library_id DESC",
      );
    }
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
    expect(result.indexBuilding).toBe(false);
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.includes("FROM ggr_library_entries"),
      ),
    ).toHaveLength(0);
  });

  it("still says indexBuilding for no ids when nothing has synced", async () => {
    // The empty-id short-circuit used to run before the readiness check, so an
    // unsynced index answered `indexBuilding: false, entries: []` -- "none of
    // these are in the library" -- for a batch it had no basis to answer at
    // all. This function has no backend fallback, which is why its callers
    // keep one and switch on this flag; a confident empty answer takes that
    // fallback away on exactly the installs that need it, since
    // LIBRARY_SYNC_ENABLED is off by default.
    synced = false;
    const { entriesByIgdbIds } = await router();

    const result = await entriesByIgdbIds([]);

    expect(result.indexBuilding).toBe(true);
    expect(result.entries).toEqual([]);
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
