/**
 * Regression tests for withTransaction.
 *
 * `query` takes a fresh pooled client per call, so two consecutive calls are two
 * implicit transactions and the first can commit while the second fails. Every
 * multi-statement request path in the app had that shape. This is the mechanism
 * the bulk update and the admin edit page now rely on to be all-or-nothing, so
 * the guarantees it makes are worth pinning directly: one client for the whole
 * unit, COMMIT only on success, ROLLBACK on failure with the original error
 * surfaced, and the client always released.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const statements = [];
let queryImpl;

const client = {
  query: vi.fn(async (text, params) => {
    statements.push(text);
    return queryImpl(text, params);
  }),
  release: vi.fn(),
};

const pool = {
  connect: vi.fn(async () => client),
  on: vi.fn(),
  end: vi.fn(),
};

const Pool = vi.fn(() => pool);

// database.js resolves `pg` with `await import("pg")`, then `pkg.default || pkg`.
vi.mock("pg", () => ({ default: { Pool } }));
// The module refuses to run in a browser; say explicitly which side we are on.
vi.mock("$app/environment", () => ({ browser: false }));

/** A pristine copy, so each test builds its own pool from the mocked pg. */
async function freshDatabase() {
  vi.resetModules();
  return import("$lib/database.js");
}

describe("withTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statements.length = 0;
    queryImpl = async () => ({ rows: [] });
    process.env.POSTGRES_PASSWORD = "test-password";
    pool.connect.mockImplementation(async () => client);
  });

  afterEach(async () => {
    const { resetPool } = await import("$lib/database.js");
    resetPool();
  });

  it("wraps the callback in BEGIN and COMMIT", async () => {
    const { withTransaction } = await freshDatabase();

    await withTransaction(async (tx) => {
      await tx("UPDATE one");
      await tx("UPDATE two");
    });

    expect(statements).toEqual(["BEGIN", "UPDATE one", "UPDATE two", "COMMIT"]);
  });

  it("returns whatever the callback returned", async () => {
    const { withTransaction } = await freshDatabase();

    await expect(withTransaction(async () => "done")).resolves.toBe("done");
  });

  it("runs every statement on the same client, which is what makes it one unit", async () => {
    const { withTransaction } = await freshDatabase();

    await withTransaction(async (tx) => {
      await tx("UPDATE one");
      await tx("UPDATE two");
    });

    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it("rolls back and does not commit when a statement fails", async () => {
    const { withTransaction } = await freshDatabase();
    queryImpl = async (text) => {
      if (text === "UPDATE two") throw new Error("23505");
      return { rows: [] };
    };

    await expect(
      withTransaction(async (tx) => {
        await tx("UPDATE one");
        await tx("UPDATE two");
      }),
    ).rejects.toThrow("23505");

    expect(statements).toEqual([
      "BEGIN",
      "UPDATE one",
      "UPDATE two",
      "ROLLBACK",
    ]);
    expect(statements).not.toContain("COMMIT");
  });

  it("rolls back when the callback throws without any statement failing", async () => {
    // How a caller aborts deliberately: the conflict is detected in JavaScript
    // and thrown, and the writes already made must go with it.
    const { withTransaction } = await freshDatabase();

    await expect(
      withTransaction(async (tx) => {
        await tx("UPDATE one");
        throw new Error("conflict");
      }),
    ).rejects.toThrow("conflict");

    expect(statements).toEqual(["BEGIN", "UPDATE one", "ROLLBACK"]);
  });

  it("surfaces the original failure, not a failure to roll back", async () => {
    const { withTransaction } = await freshDatabase();
    queryImpl = async (text) => {
      if (text === "UPDATE one") throw new Error("the real problem");
      if (text === "ROLLBACK") throw new Error("connection is gone");
      return { rows: [] };
    };

    await expect(
      withTransaction(async (tx) => {
        await tx("UPDATE one");
      }),
    ).rejects.toThrow("the real problem");
  });

  it("releases the client on success", async () => {
    const { withTransaction } = await freshDatabase();

    await withTransaction(async () => {});

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the client on failure, so a rolled-back batch cannot leak it", async () => {
    const { withTransaction } = await freshDatabase();

    await expect(
      withTransaction(async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
