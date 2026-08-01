/**
 * Regression tests for the normalized library record.
 *
 * Every backend maps its native shape into this one vocabulary. igdbId is
 * normalised to a string here, once: the existing cross-reference code
 * stringifies on insert but not on lookup, so a numeric id silently misses.
 */

import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CapabilityUnsupported,
  LIST_ORDERS,
  normalizeEntry,
} from "$lib/library/types.js";

describe("normalizeEntry", () => {
  it("keeps the fields the app needs", () => {
    const entry = normalizeEntry({
      id: 42,
      name: "Chrono Trigger",
      platformName: "Super Nintendo",
      igdbId: "1721",
      sizeBytes: 4194304,
      coverUrl: "https://example.test/c.png",
      path: "/roms/snes/ct.sfc",
    });

    expect(entry).toMatchObject({
      id: "42",
      name: "Chrono Trigger",
      platformName: "Super Nintendo",
      igdbId: "1721",
      sizeBytes: 4194304,
      coverUrl: "https://example.test/c.png",
      path: "/roms/snes/ct.sfc",
    });
  });

  it("stringifies a numeric igdbId, which is the bug it exists to prevent", () => {
    expect(normalizeEntry({ id: "1", name: "x", igdbId: 1721 }).igdbId).toBe(
      "1721",
    );
  });

  it("stringifies the backend id, since backends disagree about its type", () => {
    expect(normalizeEntry({ id: 7, name: "x" }).id).toBe("7");
  });

  it("nulls a missing igdbId rather than leaving it undefined", () => {
    expect(normalizeEntry({ id: "1", name: "x" }).igdbId).toBeNull();
  });

  it("treats an empty-string igdbId as absent", () => {
    expect(
      normalizeEntry({ id: "1", name: "x", igdbId: "" }).igdbId,
    ).toBeNull();
  });

  it("keeps addedAt null when the backend has no timestamp", () => {
    // Retrom's Game message carries id, path and platform_id and no date.
    expect(normalizeEntry({ id: "1", name: "x" }).addedAt).toBeNull();
  });

  it("parses addedAt from a string", () => {
    const entry = normalizeEntry({
      id: "1",
      name: "x",
      addedAt: "2026-07-30T01:02:03Z",
    });

    expect(entry.addedAt).toBeInstanceOf(Date);
    expect(entry.addedAt.toISOString()).toBe("2026-07-30T01:02:03.000Z");
  });

  it("rejects an entry with no id", () => {
    expect(() => normalizeEntry({ name: "x" })).toThrow(/id/);
  });

  it("rejects an entry with no name", () => {
    expect(() => normalizeEntry({ id: "1" })).toThrow(/name/);
  });
});

describe("CAPABILITIES", () => {
  it("names every capability the router branches on", () => {
    expect(Object.values(CAPABILITIES).sort()).toEqual([
      "GET_BY_ID",
      "LIST_PLATFORMS",
      "LIST_RECENT",
      "SEARCH",
      "SYNC",
    ]);
  });

  it("is frozen, so a backend cannot invent one", () => {
    expect(Object.isFrozen(CAPABILITIES)).toBe(true);
  });
});

describe("LIST_ORDERS", () => {
  it("names both listEntries modes, so neither is inferred", () => {
    // LIST_RECENT and SEARCH used to be told apart only by whether a search
    // term had been passed, which left a backend no way to say it can do one
    // and not the other.
    expect(Object.values(LIST_ORDERS).sort()).toEqual(["recent", "relevance"]);
  });

  it("is frozen, so a backend cannot invent an ordering", () => {
    expect(Object.isFrozen(LIST_ORDERS)).toBe(true);
  });
});

describe("CapabilityUnsupported", () => {
  it("names the backend and the capability", () => {
    const error = new CapabilityUnsupported("retrom", "SEARCH");

    expect(error.message).toContain("retrom");
    expect(error.message).toContain("SEARCH");
    expect(error).toBeInstanceOf(Error);
  });

  it("carries the kind and capability as properties, not only as prose", () => {
    const error = new CapabilityUnsupported("retrom", CAPABILITIES.SEARCH);

    expect(error.kind).toBe("retrom");
    expect(error.capability).toBe("SEARCH");
    expect(error.name).toBe("CapabilityUnsupported");
  });
});

describe("a backend that declares only SYNC", () => {
  /**
   * The minimum a Retrom-shaped backend has to look like. Retrom's GetGames
   * takes no limit, offset, ordering or search term, so it can enumerate the
   * library and nothing else.
   *
   * It throws rather than omitting listEntries. A missing method would give the
   * caller `TypeError: library.listEntries is not a function`, naming neither
   * the backend nor the capability; this names both.
   */
  function syncOnlyBackend() {
    const capabilities = new Set([CAPABILITIES.SYNC]);

    return {
      kind: () => "retrom",
      capabilities: () => new Set(capabilities),
      listEntries: async ({ search = null } = {}) => {
        const required = search
          ? CAPABILITIES.SEARCH
          : CAPABILITIES.LIST_RECENT;
        if (!capabilities.has(required)) {
          throw new CapabilityUnsupported("retrom", required);
        }
        return [];
      },
      syncEntries: async ({ onBatch }) => {
        await onBatch([]);
      },
    };
  }

  it("declares SYNC and nothing else", () => {
    const capabilities = syncOnlyBackend().capabilities();

    expect(capabilities.has(CAPABILITIES.SYNC)).toBe(true);
    expect(capabilities.has(CAPABILITIES.SEARCH)).toBe(false);
    expect(capabilities.has(CAPABILITIES.LIST_RECENT)).toBe(false);
  });

  it("throws CapabilityUnsupported when asked to search", async () => {
    await expect(
      syncOnlyBackend().listEntries({ search: "metroid" }),
    ).rejects.toThrow(CapabilityUnsupported);
  });

  it("reports which backend and which capability", async () => {
    const error = await syncOnlyBackend()
      .listEntries({ search: "metroid" })
      .catch((thrown) => thrown);

    expect(error.kind).toBe("retrom");
    expect(error.capability).toBe(CAPABILITIES.SEARCH);
    expect(error.message).toContain("retrom");
    expect(error.message).toContain("SEARCH");
  });

  it("names LIST_RECENT, not SEARCH, when asked for a recent listing", async () => {
    // The two modes are distinct capabilities, so a backend that has neither
    // still has to say which one was asked for.
    const error = await syncOnlyBackend()
      .listEntries({ order: LIST_ORDERS.RECENT })
      .catch((thrown) => thrown);

    expect(error.capability).toBe(CAPABILITIES.LIST_RECENT);
  });

  it("still syncs, which is the one capability every backend must have", async () => {
    const batches = [];
    await syncOnlyBackend().syncEntries({
      onBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(1);
  });
});
