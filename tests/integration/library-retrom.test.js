/**
 * Regression tests for the Retrom backend.
 *
 * Retrom has no REST API and no server module in this codebase, so the
 * transport is mocked at `fetch` and the fixtures are real protobuf bytes,
 * built with the same encoders the backend sends. Mocking at a higher level
 * would test the field mapping and skip the wire format, which is the half most
 * likely to be wrong.
 *
 * The field numbers asserted here come from the descriptors embedded in the
 * running server's own client bundle (Retrom 0.8.4), and the shapes match
 * responses captured from it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  boolField,
  bytesField,
  concatBytes,
  stringField,
  varintField,
} from "$lib/library/retrom-proto.js";
import { frameRequest } from "$lib/library/retrom-grpcweb.js";

// -- fixtures ---------------------------------------------------------------

/** `google.protobuf.Timestamp` as a nested message. */
function timestamp(field, isoString) {
  const ms = Date.parse(isoString);
  return bytesField(
    field,
    concatBytes(
      varintField(1, Math.floor(ms / 1000)),
      varintField(2, (ms % 1000) * 1e6),
    ),
  );
}

/** `Platform`: id 1, path 2, is_deleted 6. */
function platform({ id, path, isDeleted = false }) {
  return bytesField(
    1,
    concatBytes(
      varintField(1, id),
      stringField(2, path),
      isDeleted ? varintField(6, 1) : new Uint8Array(0),
    ),
  );
}

/** `PlatformMetadata`: platform_id 1, name 2 -- field 2 of the response. */
function platformMetadata({ platformId, name }) {
  return bytesField(
    2,
    concatBytes(varintField(1, platformId), stringField(2, name)),
  );
}

/** `Game`: id 1, path 3, platform_id 4, created_at 5, is_deleted 8. */
function game({ id, path, platformId, createdAt = null, isDeleted = false }) {
  return bytesField(
    1,
    concatBytes(
      varintField(1, id),
      stringField(3, path),
      varintField(4, platformId),
      createdAt ? timestamp(5, createdAt) : new Uint8Array(0),
      isDeleted ? varintField(8, 1) : new Uint8Array(0),
    ),
  );
}

/** `GameMetadata`: game_id 1, name 2, cover_url 4, igdb_id 7. */
function gameMetadata({ gameId, name, coverUrl = null, igdbId = null }) {
  return bytesField(
    2,
    concatBytes(
      varintField(1, gameId),
      stringField(2, name),
      coverUrl ? stringField(4, coverUrl) : new Uint8Array(0),
      igdbId === null ? new Uint8Array(0) : varintField(7, igdbId),
    ),
  );
}

/** `GameFile`: byte_size 3, path 4, game_id 6, is_deleted 10. */
function gameFile({ gameId, byteSize, path = "/x", isDeleted = false }) {
  return bytesField(
    3,
    concatBytes(
      varintField(3, byteSize),
      stringField(4, path),
      varintField(6, gameId),
      isDeleted ? varintField(10, 1) : new Uint8Array(0),
    ),
  );
}

/** A gRPC-Web response: one data frame, then a trailer frame. */
function grpcResponse(message, { status = 0, grpcMessage = "" } = {}) {
  const trailerText = `grpc-status:${status}\r\n${
    grpcMessage ? `grpc-message:${grpcMessage}\r\n` : ""
  }`;
  const trailerBytes = new TextEncoder().encode(trailerText);
  const trailerFrame = new Uint8Array(5 + trailerBytes.length);
  trailerFrame[0] = 0x80;
  new DataView(trailerFrame.buffer).setUint32(1, trailerBytes.length, false);
  trailerFrame.set(trailerBytes, 5);

  const body = concatBytes(frameRequest(message), trailerFrame);

  return {
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

// -- harness ----------------------------------------------------------------

/**
 * A transport that answers each RPC from a routing table.
 *
 * Keyed on the method name so a test says what GetGames returns without caring
 * how many times GetPlatforms was called first.
 */
function transportFor(routes) {
  return vi.fn(async (url) => {
    for (const [method, respond] of Object.entries(routes)) {
      if (url.endsWith(method)) {
        return typeof respond === "function" ? respond(url) : respond;
      }
    }
    throw new Error(`unexpected RPC: ${url}`);
  });
}

async function backend(routes, extra = {}) {
  vi.resetModules();
  const { createRetromLibrary } = await import("$lib/library/retrom.js");
  return createRetromLibrary({
    kind: "retrom",
    url: "http://retrom.test:5101",
    publicUrl: "https://retrom.example.com",
    fetch: transportFor(routes),
    ...extra,
  });
}

/** GetPlatforms answering with one "nes" platform, id 2, and no metadata. */
const ONE_PLATFORM = grpcResponse(
  platform({ id: 2, path: "/app/data/library/nes" }),
);

describe("Retrom library backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports its kind", async () => {
    expect((await backend({})).kind()).toBe("retrom");
  });

  // -- capabilities ---------------------------------------------------------

  it("declares exactly SYNC, GET_BY_ID and LIST_PLATFORMS", async () => {
    const capabilities = (await backend({})).capabilities();

    expect([...capabilities].sort()).toEqual([
      "GET_BY_ID",
      "LIST_PLATFORMS",
      "SYNC",
    ]);
  });

  it("hands out a copy, so a caller cannot mutate the backend's set", async () => {
    // Object.freeze on a Set leaves `add` working, so freezing is not a defence.
    const library = await backend({});
    library.capabilities().add("SEARCH");

    expect(library.capabilities().has("SEARCH")).toBe(false);
  });

  it("throws CapabilityUnsupported for LIST_RECENT, naming kind and capability", async () => {
    const library = await backend({});

    await expect(library.listEntries({ limit: 10 })).rejects.toMatchObject({
      name: "CapabilityUnsupported",
      kind: "retrom",
      capability: "LIST_RECENT",
    });
  });

  it("throws CapabilityUnsupported for SEARCH when a search term is passed", async () => {
    const library = await backend({});

    await expect(
      library.listEntries({ search: "zelda" }),
    ).rejects.toMatchObject({
      name: "CapabilityUnsupported",
      kind: "retrom",
      capability: "SEARCH",
    });
  });

  it("names the backend in the error message, not just in a field", async () => {
    const library = await backend({});
    await expect(library.listEntries({})).rejects.toThrow(
      /retrom does not support LIST_RECENT/,
    );
  });

  // -- probe ----------------------------------------------------------------

  it("reports the server version from GetServerInfo", async () => {
    // ServerInfo.version = Version{major 1, minor 2, patch 3} -> 0.8.4
    const version = bytesField(
      1,
      bytesField(
        1,
        concatBytes(varintField(1, 0), varintField(2, 8), varintField(3, 4)),
      ),
    );

    const result = await (
      await backend({ "ServerService/GetServerInfo": grpcResponse(version) })
    ).probe();

    expect(result).toMatchObject({ ok: true, version: "0.8.4" });
  });

  it("reports a probe failure rather than throwing", async () => {
    const result = await (
      await backend({
        "ServerService/GetServerInfo": {
          status: 502,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(0),
        },
      })
    ).probe();

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("HTTP 502");
  });

  // -- the trap: 200 OK with a non-zero gRPC status -------------------------

  it("treats HTTP 200 with grpc-status 13 as a failure, not an empty library", async () => {
    // gRPC carries its status in the trailers. Reading only the status line
    // would report a refusal as a successful sync of zero games -- which, once
    // the pass is marked complete, is what lets the sweep empty the index.
    const library = await backend({
      "PlatformService/GetPlatforms": grpcResponse(new Uint8Array(0), {
        status: 13,
        grpcMessage: "database is gone",
      }),
    });

    await expect(library.listPlatforms()).rejects.toThrow(
      /INTERNAL.*database is gone/,
    );
  });

  it("treats a response with no grpc-status at all as a failure", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": {
        status: 200,
        headers: { get: () => null },
        // A data frame and no trailer frame.
        arrayBuffer: async () => frameRequest(new Uint8Array(0)).buffer,
      },
    });

    await expect(library.listPlatforms()).rejects.toThrow(/no grpc-status/);
  });

  // -- platforms ------------------------------------------------------------

  it("names a platform from its metadata when Retrom has matched it", async () => {
    const platforms = await (
      await backend({
        "PlatformService/GetPlatforms": grpcResponse(
          concatBytes(
            platform({ id: 2, path: "/app/data/library/nes" }),
            platformMetadata({
              platformId: 2,
              name: "Nintendo Entertainment System",
            }),
          ),
        ),
      })
    ).listPlatforms();

    expect(platforms).toEqual([
      { id: "2", name: "Nintendo Entertainment System" },
    ]);
  });

  it("falls back to the library directory name when there is no metadata", async () => {
    // What the live instance actually does: GetPlatforms returned platforms and
    // no metadata at all, with and without with_metadata set.
    const platforms = await (
      await backend({ "PlatformService/GetPlatforms": ONE_PLATFORM })
    ).listPlatforms();

    expect(platforms).toEqual([{ id: "2", name: "nes" }]);
  });

  it("omits a soft-deleted platform", async () => {
    const platforms = await (
      await backend({
        "PlatformService/GetPlatforms": grpcResponse(
          concatBytes(
            platform({ id: 2, path: "/library/nes" }),
            platform({ id: 3, path: "/library/gone", isDeleted: true }),
          ),
        ),
      })
    ).listPlatforms();

    expect(platforms.map((p) => p.id)).toEqual(["2"]);
  });

  // -- field mapping --------------------------------------------------------

  it("normalises a game into LibraryEntry shape", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({
            id: 42,
            path: "/app/data/library/nes/chrono.nes",
            platformId: 2,
            createdAt: "2026-07-30T13:04:41.000Z",
          }),
          gameMetadata({
            gameId: 42,
            name: "Chrono Trigger",
            coverUrl: "http://retrom.test:5101/rest/public/cover-42.png",
            igdbId: 1721,
          }),
          gameFile({ gameId: 42, byteSize: 4194304 }),
        ),
      ),
    });

    const entry = await library.getEntry("42");

    expect(entry).toMatchObject({
      id: "42",
      name: "Chrono Trigger",
      platformName: "nes",
      igdbId: "1721",
      sizeBytes: 4194304,
      coverUrl: "http://retrom.test:5101/rest/public/cover-42.png",
      path: "/app/data/library/nes/chrono.nes",
    });
    expect(entry.addedAt).toBeInstanceOf(Date);
    expect(entry.addedAt.toISOString()).toBe("2026-07-30T13:04:41.000Z");
  });

  it("emits a null igdbId when the metadata carries none", async () => {
    // The live case. A wrong id silently marks unrelated games as owned, which
    // is worse than a missing badge, so absence must survive as null.
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 3, path: "/library/nes/proof.nes", platformId: 2 }),
          gameMetadata({ gameId: 3, name: "ROM Hub proof matrix" }),
        ),
      ),
    });

    expect((await library.getEntry(3)).igdbId).toBeNull();
  });

  it("falls back to the file name when a game has no metadata row at all", async () => {
    // Also the live case: one of the two games on the instance had no metadata.
    // normalizeEntry rejects a nameless entry, so without this the game is lost.
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        game({
          id: 1,
          path: "/app/data/library/nes/proof-seed.nes",
          platformId: 2,
        }),
      ),
    });

    const entry = await library.getEntry(1);
    expect(entry.name).toBe("proof-seed.nes");
    expect(entry.igdbId).toBeNull();
    expect(entry.sizeBytes).toBeNull();
  });

  it("sums every file of a multi-file game", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 7, path: "/library/ps1/game", platformId: 2 }),
          gameFile({ gameId: 7, byteSize: 100 }),
          gameFile({ gameId: 7, byteSize: 250 }),
          gameFile({ gameId: 7, byteSize: 999, isDeleted: true }),
        ),
      ),
    });

    expect((await library.getEntry(7)).sizeBytes).toBe(350);
  });

  it("resolves a relative cover against the browser-facing base", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 5, path: "/library/nes/a.nes", platformId: 2 }),
          gameMetadata({
            gameId: 5,
            name: "A",
            coverUrl: "/rest/public/a.png",
          }),
        ),
      ),
    });

    expect((await library.getEntry(5)).coverUrl).toBe(
      "https://retrom.example.com/rest/public/a.png",
    );
  });

  it("returns null for a game Retrom does not have", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(new Uint8Array(0)),
    });

    expect(await library.getEntry(999)).toBeNull();
  });

  it("returns null for a non-numeric id without calling Retrom", async () => {
    const fetchSpy = vi.fn();
    const library = await backend({}, { fetch: fetchSpy });

    expect(await library.getEntry("not-an-id")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -- resilience -----------------------------------------------------------

  it("skips a malformed record and keeps the rest of the response", async () => {
    // A Game with no id cannot be normalised; the other two must survive.
    const nameless = bytesField(1, stringField(3, "/library/nes/orphan.nes"));

    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 1, path: "/library/nes/a.nes", platformId: 2 }),
          nameless,
          game({ id: 2, path: "/library/nes/b.nes", platformId: 2 }),
        ),
      ),
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 500,
      onBatch: (b) => batches.push(b),
    });

    expect(batches[0].map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("omits a soft-deleted game", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 1, path: "/library/nes/a.nes", platformId: 2 }),
          game({
            id: 2,
            path: "/library/nes/gone.nes",
            platformId: 2,
            isDeleted: true,
          }),
        ),
      ),
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 500,
      onBatch: (b) => batches.push(b),
    });

    expect(batches[0].map((e) => e.id)).toEqual(["1"]);
  });

  // -- the per-platform enumeration -----------------------------------------

  it("enumerates every platform and terminates", async () => {
    const gamesFor = {
      2: grpcResponse(
        game({ id: 1, path: "/library/nes/a.nes", platformId: 2 }),
      ),
      3: grpcResponse(
        game({ id: 2, path: "/library/snes/b.sfc", platformId: 3 }),
      ),
    };
    let call = 0;

    const library = await backend({
      "PlatformService/GetPlatforms": grpcResponse(
        concatBytes(
          platform({ id: 2, path: "/library/nes" }),
          platform({ id: 3, path: "/library/snes" }),
        ),
      ),
      // One response per platform, in order. A walk that did not terminate
      // would run off the end of this list and throw.
      "GameService/GetGames": () => {
        call += 1;
        if (call === 1) return gamesFor[2];
        if (call === 2) return gamesFor[3];
        throw new Error("GetGames called more times than there are platforms");
      },
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 500,
      onBatch: (b) => batches.push(b),
    });

    expect(call).toBe(2);
    expect(batches.flat().map((e) => e.id)).toEqual(["1", "2"]);
    expect(batches.flat().map((e) => e.platformName)).toEqual(["nes", "snes"]);
  });

  it("makes an empty library one completed pass with no batches", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": grpcResponse(new Uint8Array(0)),
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 500,
      onBatch: (b) => batches.push(b),
    });

    // No platforms means no GetGames, no batches -- and, crucially, no throw:
    // the pass completes so the sweep guard, not an exception, is what protects
    // the index.
    expect(batches).toEqual([]);
  });

  it("respects batchSize, filling batches across platform boundaries", async () => {
    // Three games on one platform and two on the next, batchSize 2 -> batches
    // of 2, 2, 1. The third batch straddles the platforms, which is the point:
    // batching per platform would give 2,1,2 and make batchSize a suggestion.
    const library = await backend({
      "PlatformService/GetPlatforms": grpcResponse(
        concatBytes(
          platform({ id: 2, path: "/library/nes" }),
          platform({ id: 3, path: "/library/snes" }),
        ),
      ),
      "GameService/GetGames": (() => {
        let call = 0;
        return () => {
          call += 1;
          if (call === 1) {
            return grpcResponse(
              concatBytes(
                game({ id: 1, path: "/a.nes", platformId: 2 }),
                game({ id: 2, path: "/b.nes", platformId: 2 }),
                game({ id: 3, path: "/c.nes", platformId: 2 }),
              ),
            );
          }
          return grpcResponse(
            concatBytes(
              game({ id: 4, path: "/d.sfc", platformId: 3 }),
              game({ id: 5, path: "/e.sfc", platformId: 3 }),
            ),
          );
        };
      })(),
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 2,
      onBatch: (b) => batches.push([...b]),
    });

    expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batches[2][0].platformName).toBe("snes");
  });

  it("does not emit a trailing empty batch when the library divides evenly", async () => {
    const library = await backend({
      "PlatformService/GetPlatforms": ONE_PLATFORM,
      "GameService/GetGames": grpcResponse(
        concatBytes(
          game({ id: 1, path: "/a.nes", platformId: 2 }),
          game({ id: 2, path: "/b.nes", platformId: 2 }),
        ),
      ),
    });

    const batches = [];
    await library.syncEntries({
      batchSize: 2,
      onBatch: (b) => batches.push(b),
    });

    expect(batches).toHaveLength(1);
  });

  // -- the request shape ----------------------------------------------------

  it("asks for metadata and files, and filters by platform id", async () => {
    const fetchSpy = vi.fn(async (url) => {
      if (url.endsWith("PlatformService/GetPlatforms")) return ONE_PLATFORM;
      return grpcResponse(new Uint8Array(0));
    });

    const library = await backend({}, { fetch: fetchSpy });
    await library.syncEntries({ batchSize: 500, onBatch: () => {} });

    const body = fetchSpy.mock.calls[1][1].body;
    // The frame header is flags 00 then a big-endian length of 7, followed by
    // the seven message bytes: platform_ids{field 1, packed, [2]} = 0a0102,
    // with_metadata{field 3} = 1801, with_files{field 4} = 2001. Asserted as
    // exact bytes because this is the request the live server accepted, and a
    // field number that drifted would still produce a well-formed message.
    const hex = [...body].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe("00000000070a010218012001");
  });

  it("sends the gRPC-Web content type, which is what routes to the gRPC handlers", async () => {
    const fetchSpy = vi.fn(async () => ONE_PLATFORM);
    const library = await backend({}, { fetch: fetchSpy });
    await library.listPlatforms();

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["content-type"]).toBe("application/grpc-web+proto");
    expect(headers["x-grpc-web"]).toBe("1");
  });

  it("posts to the fully-qualified method path", async () => {
    const fetchSpy = vi.fn(async () => ONE_PLATFORM);
    await (await backend({}, { fetch: fetchSpy })).listPlatforms();

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "http://retrom.test:5101/retrom.PlatformService/GetPlatforms",
    );
  });

  it("refuses to call anything when LIBRARY_URL is unset", async () => {
    const library = await backend({}, { url: "", fetch: vi.fn() });

    await expect(library.listPlatforms()).rejects.toThrow(/not configured/);
  });
});
