/**
 * Regression tests for resuming an interrupted enumeration.
 *
 * RomM's /roms takes no id-greater-than filter, so the walk is still
 * offset-based and a failed pass used to restart at offset 0. On a 72,162-rom
 * library one slow page therefore cost the whole 85-minute enumeration, over
 * and over, and if the slow page was reliably slow the pass could never
 * complete at all -- which means last_completed_at is never written and the
 * index never becomes readable.
 *
 * Resuming is cheap. Resuming *safely* is the part with teeth, and two
 * properties carry it:
 *
 *   - The sweep boundary belongs to the logical enumeration, not to one run of
 *     it. Moving last_started_at on resume would make every row the earlier
 *     runs wrote look older than the boundary, and the sweep would take the
 *     lot.
 *   - A resumed pass does not sweep at all. An offset walk stitched across two
 *     points in time can step past a region that a deletion shifted, and from
 *     the sweep's side that miss is indistinguishable from the rows being gone.
 *     Deletion waits for a pass that walked the whole library in one run.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async () => ({ rows: [] }));
const syncEntries = vi.fn(async () => {});

/** Every client withClient has handed out during the current test. */
const clients = [];

/** What SELECT resume_offset answers, or null for "no row yet". */
let resumeRow = null;

/**
 * What the sweep's plausibility count answers. Strings, because count() is
 * bigint and node-postgres will not silently narrow one to a Number.
 */
let sweepCounts = { live: "0", stale: "0" };

function checkOutClient() {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (text, params) => {
      calls.push([text, params]);
      if (text.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked: true }] };
      }
      if (text.includes("count(*) AS live")) {
        return { rows: [sweepCounts] };
      }
      if (text.includes("SELECT resume_offset")) {
        return { rows: resumeRow ? [resumeRow] : [] };
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

async function run(options = {}) {
  vi.resetModules();
  const { syncLibrary } = await import("$lib/library/sync.js");
  return syncLibrary(options);
}

/** SQL statements issued, for asserting on what did and did not happen. */
function sql() {
  return clients.flatMap((client) => client.calls.map(([text]) => text));
}

/** Every statement whose SQL contains `fragment`, as [text, params]. */
function statements(fragment) {
  return clients.flatMap((client) =>
    client.calls.filter(([text]) => text.includes(fragment)),
  );
}

/** The first statement containing `fragment`, as [text, params]. */
function statement(fragment) {
  const [first] = statements(fragment);
  if (!first) throw new Error(`no statement containing ${fragment}`);
  return first;
}

/** A backend that walks `pages` pages of `size` entries and then stops. */
function walks(pages, size, { throwOnPage = null } = {}) {
  syncEntries.mockImplementation(async ({ startOffset = 0, onBatch }) => {
    let offset = startOffset;
    for (let page = 0; page < pages; page += 1) {
      if (page === throwOnPage) throw new Error("gateway timeout");
      const entries = Array.from({ length: size }, (_, i) => ({
        id: String(offset + i),
        name: `game ${offset + i}`,
      }));
      offset += size;
      await onBatch(entries, { nextOffset: offset });
    }
  });
}

describe("resuming an interrupted pass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.length = 0;
    resumeRow = null;
    sweepCounts = { live: "0", stale: "0" };
    walks(2, 3);
  });

  it("starts a fresh pass at offset zero", async () => {
    await run();

    expect(syncEntries).toHaveBeenCalledWith(
      expect.objectContaining({ startOffset: 0 }),
    );
  });

  it("records how far the walk got, after every batch", async () => {
    await run();

    const progress = statements("SET resume_offset");
    expect(progress).toHaveLength(2);
    expect(progress[0][1]).toEqual(["romm", 3, 3]);
    expect(progress[1][1]).toEqual(["romm", 6, 6]);
  });

  it("hands the backend the recorded offset on the next pass", async () => {
    resumeRow = { resume_offset: 62650, resume_upserted: 62650 };

    await run();

    expect(syncEntries).toHaveBeenCalledWith(
      expect.objectContaining({ startOffset: 62650 }),
    );
  });

  it("does not move the sweep boundary when resuming", async () => {
    // last_started_at is what the sweep compares synced_at against. Reset
    // here, every row the interrupted run already wrote is older than the
    // boundary, and the sweep marks the whole of it removed.
    resumeRow = { resume_offset: 62650, resume_upserted: 62650 };

    await run();

    expect(
      sql().some((text) => text.includes("INSERT INTO ggr_library_sync_state")),
    ).toBe(false);
    expect(sql().some((text) => text.includes("last_started_at = NOW()"))).toBe(
      false,
    );
  });

  it("moves the boundary on a fresh pass, so the previous one is not inherited", async () => {
    // The control for the test above: without this, "does not move the
    // boundary" would pass on an implementation that never moves it at all.
    await run();

    const [text, params] = statement("INSERT INTO ggr_library_sync_state");
    expect(text).toContain("NOW()");
    expect(params).toEqual(["romm"]);
  });

  it("clears any stale resume point when a fresh pass starts", async () => {
    // A backend that stopped reporting progress mid-walk, or a resume point
    // left behind by a pass whose completion write failed, must not be
    // inherited by an enumeration that is starting from zero.
    await run();

    const [text] = statement("INSERT INTO ggr_library_sync_state");
    expect(text).toContain("resume_offset = NULL");
    expect(text).toContain("resume_upserted = NULL");
  });

  it("does not sweep after a resumed pass", async () => {
    // An offset walk stitched across two points in time can step past a
    // region that an intervening deletion shifted. The sweep cannot tell that
    // miss apart from the rows being gone, so it does not get to decide.
    resumeRow = { resume_offset: 62650, resume_upserted: 62650 };
    sweepCounts = { live: "72162", stale: "9000" };

    const result = await run();

    expect(result.completed).toBe(true);
    expect(result.resumed).toBe(true);
    expect(result.removed).toBe(0);
    expect(sql().some((text) => text.includes("SET removed_at"))).toBe(false);
  });

  it("still sweeps after a fresh pass", async () => {
    // The control. Without it, "does not sweep after a resumed pass" would
    // pass on an implementation that never sweeps.
    sweepCounts = { live: "72162", stale: "9000" };

    const result = await run();

    expect(result.resumed).toBe(false);
    expect(sql().some((text) => text.includes("SET removed_at"))).toBe(true);
  });

  it("clears the resume point when the pass completes", async () => {
    resumeRow = { resume_offset: 62650, resume_upserted: 62650 };

    await run();

    const [text] = statement("last_completed_at = NOW()");
    expect(text).toContain("resume_offset = NULL");
    expect(text).toContain("resume_upserted = NULL");
  });

  it("leaves the resume point alone when the pass throws", async () => {
    walks(3, 3, { throwOnPage: 2 });

    const result = await run();

    expect(result.completed).toBe(false);
    // Two pages got through and both were recorded.
    expect(statements("SET resume_offset")).toHaveLength(2);
    expect(sql().some((text) => text.includes("last_completed_at"))).toBe(
      false,
    );
  });

  it("carries the upsert count across the resume, so entry_count is honest", async () => {
    // Without this, a pass that resumed at 62650 and wrote the last 512 rows
    // records entry_count = 512, which reads as a library that lost 71,650
    // games.
    resumeRow = { resume_offset: 62650, resume_upserted: 62650 };
    walks(1, 512);

    const result = await run();

    expect(result.upserted).toBe(63162);
    const [, params] = statement("last_completed_at = NOW()");
    expect(params).toEqual(["romm", 63162]);
  });

  it("does not record progress for a backend that cannot report it", async () => {
    // Retrom's GetGames takes no paging at all, so there is no offset to
    // resume from. A missing nextOffset must leave the resume point unset
    // rather than write a number that means nothing.
    syncEntries.mockImplementation(async ({ onBatch }) => {
      await onBatch([{ id: "1", name: "a" }]);
    });

    await run();

    expect(statements("SET resume_offset")).toHaveLength(0);
  });
});
