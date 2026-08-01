/**
 * Regression tests for the RomM backend.
 *
 * It delegates to the existing romm.server.js, which owns the token
 * lifecycle, the retry and deadline logic and the availability breaker.
 * This backend is a translation layer and nothing else -- the point of the
 * seam is that none of that gets duplicated per backend.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getROMById = vi.fn(async () => null);
const getPlatforms = vi.fn(async () => []);
const probeRommAvailability = vi.fn(async () => ({ ok: true }));
const rommRequest = vi.fn(async () => ({ items: [], total: 0 }));

// Exactly what library/romm.js imports. getRecentlyAddedROMs and searchROMs
// were mocked here and are not imported by it: they return app-shaped objects
// that force an IGDB round-trip per ROM, which is why the backend goes through
// the raw transport instead.
vi.mock("$lib/romm.server.js", () => ({
  getROMById,
  getPlatforms,
  probeRommAvailability,
  rommRequest,
}));

async function backend() {
  vi.resetModules();
  const { createRommLibrary } = await import("$lib/library/romm.js");
  return createRommLibrary({
    kind: "romm",
    url: "http://romm.test",
    publicUrl: "https://romm.example.com",
  });
}

describe("RomM library backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports its kind", async () => {
    expect((await backend()).kind()).toBe("romm");
  });

  it("declares every capability, since RomM can do all of them", async () => {
    const capabilities = (await backend()).capabilities();

    for (const capability of [
      "SYNC",
      "LIST_RECENT",
      "SEARCH",
      "GET_BY_ID",
      "LIST_PLATFORMS",
    ]) {
      expect(capabilities.has(capability)).toBe(true);
    }
  });

  it("hands out a copy, so a caller cannot mutate the backend's set", async () => {
    // Object.freeze on a Set leaves `add` working, so freezing is not a
    // defence. A copy per call is.
    const library = await backend();
    library.capabilities().add("NOPE");

    expect(library.capabilities().has("NOPE")).toBe(false);
  });

  it("delegates the probe rather than reimplementing the breaker", async () => {
    await (await backend()).probe();
    expect(probeRommAvailability).toHaveBeenCalledTimes(1);
  });

  it("normalises a listing into LibraryEntry shape", async () => {
    rommRequest.mockResolvedValue({
      items: [
        {
          id: 42,
          name: "Chrono Trigger",
          igdb_id: 1721,
          fs_size_bytes: 4194304,
          created_at: "2026-07-30T01:02:03Z",
          platform: { name: "Super Nintendo" },
          fs_path: "/roms/snes",
        },
      ],
      total: 1,
    });

    const [entry] = await (
      await backend()
    ).listEntries({ limit: 1, offset: 0 });

    expect(entry.id).toBe("42");
    expect(entry.igdbId).toBe("1721");
    expect(entry.platformName).toBe("Super Nintendo");
    expect(entry.addedAt).toBeInstanceOf(Date);
  });

  it("orders a listing by recency by default", async () => {
    await (await backend()).listEntries({ limit: 5 });

    const params = new URL(`http://x${rommRequest.mock.calls[0][0]}`)
      .searchParams;
    expect(params.get("order_by")).toBe("created_at");
    expect(params.get("order_dir")).toBe("desc");
    expect(params.get("search_term")).toBeNull();
  });

  it("leaves RomM's own ordering alone when asked for relevance", async () => {
    // The mode is asked for, not inferred from the presence of a search term:
    // a backend that can search but not order, or order but not search, needs
    // to be able to say so.
    await (
      await backend()
    ).listEntries({ search: "metroid", order: "relevance" });

    const params = new URL(`http://x${rommRequest.mock.calls[0][0]}`)
      .searchParams;
    expect(params.get("search_term")).toBe("metroid");
    expect(params.get("order_by")).toBeNull();
    expect(params.get("order_dir")).toBeNull();
  });

  it("logs a malformed single record rather than returning a silent null", async () => {
    // A bare null made a data problem indistinguishable from a 404, for the
    // identical failure toEntries already warns about.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    getROMById.mockResolvedValue({ id: 7, name: "" });

    const entry = await (await backend()).getEntry(7);

    expect(entry).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("resolves a platform name from a record shaped like real RomM output", async () => {
    // RomM's RomSchema has no nested `rom.platform`. Reading that first, which
    // the seam did, meant every platform name came back empty against a real
    // instance; the chain that works is platform_custom_name ->
    // platform_display_name -> platform_name.
    rommRequest.mockResolvedValue({
      items: [
        {
          id: 7,
          name: "Super Metroid",
          platform_display_name: "Super Nintendo Entertainment System",
          platform_name: "snes",
        },
      ],
      total: 1,
    });

    const [entry] = await (await backend()).listEntries({ limit: 1 });

    expect(entry.platformName).toBe("Super Nintendo Entertainment System");
  });

  it("prefers a custom platform name over the display name", async () => {
    rommRequest.mockResolvedValue({
      items: [
        {
          id: 7,
          name: "Super Metroid",
          platform_custom_name: "SNES (PAL)",
          platform_display_name: "Super Nintendo Entertainment System",
          platform_name: "snes",
        },
      ],
      total: 1,
    });

    const [entry] = await (await backend()).listEntries({ limit: 1 });

    expect(entry.platformName).toBe("SNES (PAL)");
  });

  it("makes a relative cover absolute against the public url", async () => {
    // RomM returns url_cover as a path. LibraryEntry.coverUrl is specified as
    // absolute because the next phase persists it and renders it as an
    // <img src>, which a browser on a different network cannot resolve from a
    // path alone.
    rommRequest.mockResolvedValue({
      items: [
        {
          id: 7,
          name: "Super Metroid",
          url_cover: "/assets/romm/resources/roms/7/cover.png",
        },
      ],
      total: 1,
    });

    const [entry] = await (await backend()).listEntries({ limit: 1 });

    expect(entry.coverUrl).toBe(
      "https://romm.example.com/assets/romm/resources/roms/7/cover.png",
    );
  });

  it("does not prefix a cover that is already absolute", async () => {
    rommRequest.mockResolvedValue({
      items: [
        {
          id: 7,
          name: "Super Metroid",
          url_cover: "https://cdn.example.com/cover.png",
        },
      ],
      total: 1,
    });

    const [entry] = await (await backend()).listEntries({ limit: 1 });

    expect(entry.coverUrl).toBe("https://cdn.example.com/cover.png");
  });

  it("leaves a missing cover null", async () => {
    rommRequest.mockResolvedValue({
      items: [{ id: 7, name: "Super Metroid" }],
      total: 1,
    });

    const [entry] = await (await backend()).listEntries({ limit: 1 });

    expect(entry.coverUrl).toBeNull();
  });

  it("skips a malformed record instead of failing the whole listing", async () => {
    rommRequest.mockResolvedValue({
      items: [{ id: 1, name: "good" }, { name: "no id" }],
      total: 2,
    });

    const entries = await (
      await backend()
    ).listEntries({ limit: 2, offset: 0 });

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("good");
  });

  it("hands the sync one batch per page and stops on a short page", async () => {
    rommRequest
      .mockResolvedValueOnce({
        items: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
        total: 3,
      })
      .mockResolvedValueOnce({ items: [{ id: 3, name: "c" }], total: 3 });

    const batches = [];
    await (
      await backend()
    ).syncEntries({
      batchSize: 2,
      onBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it("stops paging on an empty page, so a wrong total cannot loop forever", async () => {
    rommRequest
      .mockResolvedValueOnce({ items: [{ id: 1, name: "a" }], total: 99999 })
      .mockResolvedValueOnce({ items: [], total: 99999 });

    const batches = [];
    await (
      await backend()
    ).syncEntries({
      batchSize: 1,
      onBatch: (batch) => batches.push(batch),
    });

    expect(batches).toHaveLength(1);
  });
});
