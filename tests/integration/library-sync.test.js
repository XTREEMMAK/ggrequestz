/**
 * Regression tests for the library sync.
 *
 * The dangerous half is deletion. A pass that throws, times out or is cut
 * short must sweep nothing: a partial enumeration read as "the rest of the
 * library is gone" would empty the index and, once availability sync
 * exists, walk every fulfilled request backwards.
 *
 * Two structural properties are pinned here as well, because both fail
 * silently. The pass must run on ONE client, since the advisory lock is
 * session-scoped and releasing it on another connection warns instead of
 * raising. And the sweep boundary must stay on the database clock, since a JS
 * Date into that comparison arrives on the app container's clock rather than
 * the server's.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The module-level query, which checks a client out and releases it per call.
 * The sync must not use it at all -- these tests assert that.
 */
const query = vi.fn(async () => ({ rows: [] }));
const syncEntries = vi.fn(async () => {});

/** Every client withClient has handed out during the current test. */
const clients = [];
let lockGranted = true;

/** One checked-out client, recording every statement issued on it. */
function checkOutClient() {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (text, params) => {
      calls.push([text, params]);
      if (text.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked: lockGranted }] };
      }
      return { rows: [] };
    }),
  };
}

const withClient = vi.fn(async (fn) => {
  const client = checkOutClient();
  clients.push(client);
  return fn(client.query);
});

vi.mock("$lib/database.js", () => ({ query, withClient }));
vi.mock("$lib/library/index.js", () => ({
  getLibrary: () => ({
    kind: () => "romm",
    capabilities: () => new Set(["SYNC"]),
    syncEntries,
  }),
}));

/** Answer pg_try_advisory_lock with `granted`, and default everything else. */
function lockReturns(granted) {
  lockGranted = granted;
}

async function run(options = {}) {
  vi.resetModules();
  const { syncLibrary } = await import("$lib/library/sync.js");
  return syncLibrary(options);
}

/** SQL statements issued, for asserting on what did and did not happen. */
function sql() {
  return clients.flatMap((client) => client.calls.map(([text]) => text));
}

/** The first statement whose SQL contains `fragment`, as [text, params]. */
function statement(fragment) {
  for (const client of clients) {
    const call = client.calls.find(([text]) => text.includes(fragment));
    if (call) return call;
  }
  throw new Error(`no statement containing ${JSON.stringify(fragment)}`);
}

describe("syncLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.length = 0;
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

  it("takes and releases the lock on one client, not through the pool", async () => {
    await run();

    // pg_try_advisory_lock is session-scoped. Taken through query() and
    // released through query() they are two different sessions: the release
    // returns false with a WARNING rather than raising, so nothing catches it
    // and nothing logs, and the real lock is held until the worker exits --
    // after which every cycle forever reports `locked`.
    expect(withClient).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);

    const issued = clients[0].calls.map(([text]) => text);
    expect(issued.some((text) => text.includes("pg_try_advisory_lock"))).toBe(
      true,
    );
    expect(issued.some((text) => text.includes("pg_advisory_unlock"))).toBe(
      true,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("runs the whole pass on that client, sweep and state writes included", async () => {
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([{ id: "1", name: "a" }]);
    });

    await run();

    expect(clients).toHaveLength(1);
    const issued = clients[0].calls.map(([text]) => text);
    expect(
      issued.some((text) =>
        text.includes("INSERT INTO ggr_library_sync_state"),
      ),
    ).toBe(true);
    expect(
      issued.some((text) => text.includes("INSERT INTO ggr_library_entries")),
    ).toBe(true);
    expect(issued.some((text) => text.includes("SET removed_at"))).toBe(true);
    expect(issued.some((text) => text.includes("last_completed_at"))).toBe(
      true,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("writes last_started_at with NOW(), not with the app's clock", async () => {
    await run();

    const [text, params] = statement("INSERT INTO ggr_library_sync_state");
    expect(text).toContain("last_started_at, last_error");
    expect(text).toContain("NOW()");
    // Only the kind. A JS Date here is the sweep boundary on the wrong clock.
    expect(params).toEqual(["romm"]);
  });

  it("takes the sweep boundary from the database, never from a JS clock", async () => {
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([{ id: "1", name: "a" }]);
    });

    await run();

    const [text, params] = statement("SET removed_at");
    // node-postgres serialises a Date with the process's UTC offset and a
    // `timestamp without time zone` column discards it. With the app east of
    // Postgres, `synced_at < startedAt` is true for every row the pass just
    // inserted, so the first completed pass marks the whole library removed.
    expect(text).toContain("SELECT last_started_at");
    expect(text).toContain("FROM ggr_library_sync_state");
    expect(params).toEqual(["romm"]);
    expect(params.some((param) => param instanceof Date)).toBe(false);
  });

  it("collapses a library_id that appears twice in one batch", async () => {
    // ON CONFLICT DO UPDATE cannot touch the same row twice: Postgres raises
    // "command cannot affect row a second time", the statement aborts, the pass
    // aborts, and last_completed_at is never written -- so the index stays
    // unreadable forever. RomM pages by id and cannot hit it; a backend that
    // has to enumerate per platform sees a multi-platform title twice.
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([
        { id: "7", name: "first", platformName: "SNES" },
        { id: "8", name: "other", platformName: "Genesis" },
        { id: "7", name: "second", platformName: "Genesis" },
      ]);
    });

    await run();

    const [, params] = statement("INSERT INTO ggr_library_entries");
    const [, ids, , names, platforms] = params;
    expect(ids).toEqual(["7", "8"]);
    // Last occurrence wins, which is what ON CONFLICT DO UPDATE would have
    // left behind had the statement been legal.
    expect(names).toEqual(["second", "other"]);
    expect(platforms).toEqual(["Genesis", "Genesis"]);
  });

  it("sends added_at as an instant, into a column that stores instants", async () => {
    const addedAt = new Date("2026-03-01T12:34:56.000Z");
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([
        { id: "1", name: "a", addedAt },
        { id: "2", name: "b", addedAt: null },
      ]);
    });

    await run();

    const [text, params] = statement("INSERT INTO ggr_library_entries");
    // The Date normalizeEntry produced, unconverted, into a timestamptz.
    // Both halves matter and this assertion replaces one that pinned the
    // opposite. added_at was `timestamp without time zone` and took a UTC ISO
    // string, which put the right digits in the column -- and node-postgres
    // builds a Date from naive digits using the *process's* zone, so the
    // read-back came out shifted by the app container's UTC offset. Fixing the
    // write could not fix the read; only the column type could.
    expect(text).toContain("$9::timestamptz[]");
    expect(params[8]).toEqual([addedAt, null]);
    expect(params[8][0]).toBeInstanceOf(Date);
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
