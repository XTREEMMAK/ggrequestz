/**
 * Coverage for the SQL findOpenDuplicate actually issues.
 *
 * tests/integration/request-duplicate-guard.test.js exercises the route's
 * 409 behaviour, but it replaces this whole module with
 * vi.mock("$lib/requestPolicy.server.js", ...), so neither query below has
 * ever run. findOpenDuplicate exists purely to agree with the two partial
 * unique indexes in migrations/009_request_duplicate_guard.sql -- igdb_id
 * present vs. null, both scoped to status IN ('pending', 'approved') -- so a
 * mismatch here (a swapped placeholder, `status = $3` instead of
 * `status = ANY($3)`) would let the pre-check and the index disagree and
 * turn a handled duplicate into an unhandled 500. These tests pin the SQL
 * and the parameters directly against that intended semantics.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("$lib/database.js", () => ({ query }));

/** Import a pristine copy so no other suite's module cache can leak in. */
async function freshPolicy() {
  vi.resetModules();
  return import("$lib/requestPolicy.server.js");
}

function foundRow(overrides = {}) {
  return {
    id: "existing-1",
    status: "pending",
    user_name: "bob",
    ...overrides,
  };
}

describe("findOpenDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when igdbId is given", () => {
    it("filters on igdb_id = $1, with [igdbId, requestType, openStatuses] in order", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await findOpenDuplicate({
        igdbId: "1234",
        title: "Chrono Trigger",
        requestType: "game",
      });

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("igdb_id = $1");
      expect(sql).toContain("status = ANY($3)");
      expect(params).toEqual(["1234", "game", ["pending", "approved"]]);
    });

    it("does not query on title", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await findOpenDuplicate({
        igdbId: "1234",
        title: "Chrono Trigger",
        requestType: "game",
      });

      const [sql] = query.mock.calls[0];
      expect(sql).not.toMatch(/title/i);
    });

    it("returns the row when one is found", async () => {
      query.mockResolvedValue({ rows: [foundRow()] });
      const { findOpenDuplicate } = await freshPolicy();

      await expect(
        findOpenDuplicate({
          igdbId: "1234",
          title: "Chrono Trigger",
          requestType: "game",
        }),
      ).resolves.toEqual(foundRow());
    });

    it("returns null when nothing open matches", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await expect(
        findOpenDuplicate({
          igdbId: "1234",
          title: "Chrono Trigger",
          requestType: "game",
        }),
      ).resolves.toBeNull();
    });
  });

  describe("when igdbId is null", () => {
    it("filters on igdb_id IS NULL and normalised title, with [title, requestType, openStatuses] in order", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await findOpenDuplicate({
        igdbId: null,
        title: "  Chrono Trigger  ",
        requestType: "fix",
      });

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("igdb_id IS NULL");
      expect(sql).toContain("lower(btrim(title))");
      expect(sql).toContain("status = ANY($3)");
      expect(params).toEqual([
        "  Chrono Trigger  ",
        "fix",
        ["pending", "approved"],
      ]);
    });

    it("does not filter on igdb_id =", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await findOpenDuplicate({
        igdbId: null,
        title: "Chrono Trigger",
        requestType: "game",
      });

      const [sql] = query.mock.calls[0];
      expect(sql).not.toMatch(/igdb_id\s*=/);
    });

    it("returns the row when one is found", async () => {
      query.mockResolvedValue({ rows: [foundRow({ id: "existing-2" })] });
      const { findOpenDuplicate } = await freshPolicy();

      await expect(
        findOpenDuplicate({
          igdbId: null,
          title: "Chrono Trigger",
          requestType: "game",
        }),
      ).resolves.toEqual(foundRow({ id: "existing-2" }));
    });

    it("returns null when nothing open matches", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await expect(
        findOpenDuplicate({
          igdbId: null,
          title: "Chrono Trigger",
          requestType: "game",
        }),
      ).resolves.toBeNull();
    });
  });

  describe("open-status axis", () => {
    it("restricts both branches to exactly pending and approved, via status = ANY($3)", async () => {
      query.mockResolvedValue({ rows: [] });
      const { findOpenDuplicate } = await freshPolicy();

      await findOpenDuplicate({
        igdbId: "1234",
        title: "Chrono Trigger",
        requestType: "game",
      });
      const [igdbSql, igdbParams] = query.mock.calls[0];
      expect(igdbSql).toContain("status = ANY($3)");
      expect(igdbParams[2]).toEqual(["pending", "approved"]);

      query.mockClear();
      query.mockResolvedValue({ rows: [] });

      await findOpenDuplicate({
        igdbId: null,
        title: "Chrono Trigger",
        requestType: "game",
      });
      const [titleSql, titleParams] = query.mock.calls[0];
      expect(titleSql).toContain("status = ANY($3)");
      expect(titleParams[2]).toEqual(["pending", "approved"]);
    });
  });
});
