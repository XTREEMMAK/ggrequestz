/**
 * Regression tests for the library sync.
 *
 * The dangerous half is deletion. A pass that throws, times out or is cut
 * short must sweep nothing: a partial enumeration read as "the rest of the
 * library is gone" would empty the index and, once availability sync
 * exists, walk every fulfilled request backwards.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async () => ({ rows: [] }));
const syncEntries = vi.fn(async () => {});

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/library/index.js", () => ({
  getLibrary: () => ({
    kind: () => "romm",
    capabilities: () => new Set(["SYNC"]),
    syncEntries,
  }),
}));

/** Answer pg_try_advisory_lock with `granted`, and default everything else. */
function lockReturns(granted) {
  query.mockImplementation(async (sql) => {
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ locked: granted }] };
    }
    return { rows: [] };
  });
}

async function run(options = {}) {
  vi.resetModules();
  const { syncLibrary } = await import("$lib/library/sync.js");
  return syncLibrary(options);
}

/** SQL statements issued, for asserting on what did and did not happen. */
function sql() {
  return query.mock.calls.map(([text]) => text);
}

describe("syncLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockReturns(true);
    syncEntries.mockImplementation(async () => {});
  });

  it("does nothing when another worker holds the lock", async () => {
    lockReturns(false);

    const result = await run();

    expect(result.ran).toBe(false);
    expect(result.reason).toBe("locked");
    expect(syncEntries).not.toHaveBeenCalled();
  });

  it("releases the lock when the pass succeeds", async () => {
    await run();
    expect(sql().some((text) => text.includes("pg_advisory_unlock"))).toBe(
      true,
    );
  });

  it("releases the lock when the pass throws", async () => {
    syncEntries.mockRejectedValue(new Error("backend down"));

    const result = await run();

    expect(result.completed).toBe(false);
    expect(sql().some((text) => text.includes("pg_advisory_unlock"))).toBe(
      true,
    );
  });

  it("upserts a batch on the kind and id", async () => {
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([
        {
          id: "1",
          name: "a",
          igdbId: "10",
          platformName: "SNES",
          sizeBytes: 1,
          addedAt: null,
          coverUrl: null,
          path: null,
        },
      ]);
    });

    await run();

    const upsert = sql().find((text) =>
      text.includes("INSERT INTO ggr_library_entries"),
    );
    expect(upsert).toBeDefined();
    expect(upsert).toContain("ON CONFLICT");
    expect(upsert).toContain("removed_at = NULL");
  });

  it("writes a batch of many in one statement, not one per entry", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: String(i),
      name: `game ${i}`,
    }));
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch(many);
    });

    await run();

    const inserts = sql().filter((text) =>
      text.includes("INSERT INTO ggr_library_entries"),
    );
    expect(inserts).toHaveLength(1);
  });

  it("sweeps after a completed pass", async () => {
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([{ id: "1", name: "a" }]);
    });

    const result = await run();

    expect(result.completed).toBe(true);
    expect(sql().some((text) => text.includes("SET removed_at"))).toBe(true);
  });

  it("sweeps NOTHING when the pass throws", async () => {
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([{ id: "1", name: "a" }]);
      throw new Error("halfway");
    });

    const result = await run();

    expect(result.completed).toBe(false);
    expect(sql().some((text) => text.includes("SET removed_at"))).toBe(false);
  });

  it("records the failure so it is visible outside the logs", async () => {
    syncEntries.mockRejectedValue(new Error("backend down"));

    await run();

    const state = sql().filter((text) =>
      text.includes("ggr_library_sync_state"),
    );
    expect(state.some((text) => text.includes("last_error"))).toBe(true);
  });

  it("does not set last_completed_at when the pass failed", async () => {
    syncEntries.mockRejectedValue(new Error("backend down"));

    await run();

    const completed = sql().filter(
      (text) =>
        text.includes("ggr_library_sync_state") &&
        text.includes("last_completed_at"),
    );
    expect(completed).toHaveLength(0);
  });

  it("refuses a backend that cannot enumerate itself", async () => {
    vi.resetModules();
    vi.doMock("$lib/library/index.js", () => ({
      getLibrary: () => ({
        kind: () => "broken",
        capabilities: () => new Set([]),
        syncEntries,
      }),
    }));
    const { syncLibrary } = await import("$lib/library/sync.js");

    const result = await syncLibrary();

    expect(result.ran).toBe(false);
    expect(result.reason).toBe("unsupported");
    vi.doUnmock("$lib/library/index.js");
  });
});
