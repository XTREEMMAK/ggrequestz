/**
 * Retrom as a library backend.
 *
 * Everything below was measured against a live `retrom-service` at
 * **0.8.4** (`ServerService/GetServerInfo` -> `Version{major:0, minor:8,
 * patch:4}`). Every claim of the form "Retrom does X" means "0.8.4 was observed
 * doing X"; where a field number could not be exercised because the library
 * held no such value, it is flagged as unverified rather than quietly assumed.
 *
 * ## Retrom speaks gRPC, not REST
 *
 * There is no REST listing API to translate. `packages/rest-service` mounts
 * `/rest/file/{id}`, `/rest/game/{id}` and a static `/rest/public/*` and
 * nothing else -- no route lists games or platforms. Those live on
 * `GameService` and `PlatformService`, reached here over gRPC-Web (see
 * retrom-grpcweb.js) with a hand-rolled protobuf codec (see retrom-proto.js).
 *
 * ## Field numbers are the API, and these were recovered from the server
 *
 * A field number is the only thing on the wire, and a wrong one is a silent
 * misread rather than an error. Rather than trust notes, the schema was read
 * out of the running server: the image ships Retrom's own web client, whose
 * `@retrom/codegen` package embeds base64 `FileDescriptorProto`s. Decoding
 * those gives the exact schema the server was built from. Every number cited
 * below comes from there and was then confirmed against live responses.
 *
 *     Game            id 1, path 3, platform_id 4, created_at 5, updated_at 6,
 *                     deleted_at 7, is_deleted 8, default_file_id 9,
 *                     storage_type 10, third_party 11, steam_app_id 12
 *     GameFile        id 1, byte_size 3, path 4, game_id 6, created_at 7,
 *                     updated_at 8, deleted_at 9, is_deleted 10
 *     GameMetadata    game_id 1, name 2, description 3, cover_url 4,
 *                     background_url 5, icon_url 6, igdb_id 7, created_at 8,
 *                     updated_at 9, links 10, video_urls 11,
 *                     screenshot_urls 12, artwork_urls 13, release_date 14,
 *                     last_played 15, minutes_played 16
 *     Platform        id 1, path 2, created_at 3, updated_at 4, deleted_at 5,
 *                     is_deleted 6, third_party 7
 *     PlatformMetadata  platform_id 1, name 2, ..., igdb_id 6
 *     GetGamesRequest      platform_ids 1, ids 2, with_metadata 3,
 *                          with_files 4, include_deleted 5
 *     GetGamesResponse     games 1, metadata 2, game_files 3
 *     GetPlatformsRequest  ids 1, with_metadata 2, include_deleted 3
 *     GetPlatformsResponse platforms 1, metadata 2
 *
 * ## Retrom has no authentication
 *
 * There is nothing to log in to. Retrom builds its REST, gRPC and WebDAV
 * routers with CORS, compression and tracing layers and no auth layer; no RPC
 * takes a credential and no handler inspects metadata for one. The project's
 * own README still lists "(Multi-)User authentication" as an unchecked roadmap
 * item. Confirmed live: every call below succeeded with no token, no cookie and
 * no header beyond the content type. So `probe()` cannot check a credential --
 * it verifies reachability instead, which is the only failure it is in a
 * position to detect.
 *
 * An operator who wants Retrom protected puts it behind a reverse proxy;
 * LIBRARY_URL may carry `user:pass@` for that case and fetch will use it.
 *
 * ## Why only three capabilities
 *
 * `GetGamesRequest` has exactly five fields -- platform_ids, ids,
 * with_metadata, with_files, include_deleted. There is **no limit, no offset,
 * no ordering and no search term**, and this is not an inference from a failed
 * call: it is the whole request message as the server itself defines it. So
 * LIST_RECENT and SEARCH cannot be implemented against this API at all, and
 * `listEntries` throws rather than approximating them. The local index exists
 * for exactly this backend.
 */

import {
  CAPABILITIES,
  CapabilityUnsupported,
  normalizeEntry,
} from "./types.js";
import { createGrpcWebChannel } from "./retrom-grpcweb.js";
import {
  ProtoError,
  boolField,
  concatBytes,
  decodeMessage,
  packedVarints,
  readInt,
  readMessages,
  readString,
  readTimestamp,
} from "./retrom-proto.js";

const KIND = "retrom";

// -- method names -----------------------------------------------------------
//
// `<proto package>.<Service>/<Method>`, which is the path tonic routes on.

const GET_SERVER_INFO = "retrom.ServerService/GetServerInfo";
const GET_PLATFORMS = "retrom.PlatformService/GetPlatforms";
const GET_GAMES = "retrom.GameService/GetGames";

/**
 * What this backend can do, each measured against the live 0.8.4 instance:
 *
 * - SYNC            `GetPlatforms` returned platform 2, and
 *                   `GetGames{platform_ids:[2], with_metadata, with_files}`
 *                   returned both games with their files -- so the library can
 *                   be enumerated platform by platform, and the walk
 *                   terminates because the platform list is finite.
 * - GET_BY_ID       `GetGames{ids:[1]}` returned exactly game 1.
 * - LIST_PLATFORMS  `GetPlatforms` returned one Platform with id 1 and path 2.
 *
 * LIST_RECENT and SEARCH are absent because `GetGamesRequest` has no field
 * that could express either -- see the module docstring. Declaring them and
 * approximating in JS would mean fetching the entire library on every keystroke
 * and calling it a search.
 *
 * Handed out as a copy rather than frozen: `Object.freeze` on a Set freezes its
 * own properties and leaves `add` working, so a frozen Set is not immutable.
 */
const RETROM_CAPABILITIES = [
  CAPABILITIES.SYNC,
  CAPABILITIES.GET_BY_ID,
  CAPABILITIES.LIST_PLATFORMS,
];

/**
 * Throw when a capability was not declared.
 *
 * Exported so the contract can be tested directly rather than asserted by
 * inspection -- and unlike the RomM and Gaseous backends, this one has live
 * paths that reach it.
 *
 * @param {string[]} declared - The capabilities the backend hands out
 * @param {string} capability - The one being asked for
 * @throws {CapabilityUnsupported} When `capability` is not in `declared`
 */
export function assertCapability(declared, capability) {
  if (!declared.includes(capability)) {
    throw new CapabilityUnsupported(KIND, capability);
  }
}

/**
 * The last segment of a path, however it is separated.
 *
 * Retrom stores absolute server-side paths (`/app/data/library/nes`), and the
 * directory's own name is the only human-readable identifier it has for a
 * platform -- Retrom has no notion of a platform slug.
 *
 * @param {string|null|undefined} path - A file or directory path
 * @returns {string} - The basename, or ""
 */
export function basename(path) {
  if (!path) return "";
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/**
 * A cover as an absolute URL, or null.
 *
 * `GameMetadata.cover_url` was absolute on the measured instance
 * (`http://.../rest/public/...`), because Retrom writes it that way when it
 * downloads art. It is `optional string` with no format constraint, so a
 * relative value is possible and is resolved against the browser-facing base --
 * never the internal one. The value is persisted into the index and then
 * rendered as an `<img src>`, so a relative one would be unrecoverable for a
 * browser on a different network from the app.
 *
 * @param {string|undefined|null} publicBase - Browser-facing library base URL
 * @param {string|undefined|null} coverUrl - GameMetadata.cover_url
 * @returns {string|null}
 */
export function retromCoverUrl(publicBase, coverUrl) {
  if (!coverUrl) return null;
  if (/^https?:\/\//i.test(coverUrl)) return coverUrl;
  if (!publicBase) return null;
  return `${String(publicBase).replace(/\/+$/, "")}/${coverUrl.replace(/^\/+/, "")}`;
}

/**
 * Build the Retrom backend.
 *
 * @param {Object} config - As returned by resolveLibraryConfig()
 * @param {string} config.url - Base URL of the Retrom service port
 * @param {string} [config.publicUrl] - Browser-facing base, for covers
 * @param {Function} [config.fetch] - Transport, for tests
 * @returns {Object} - A GameLibrary
 */
export function createRetromLibrary(config) {
  const publicUrl = config?.publicUrl ?? config?.url;

  const channel = createGrpcWebChannel({
    baseUrl: config?.url,
    fetch: config?.fetch,
  });

  /** Retrom platform id -> display name, filled once per process. */
  let platformNames = null;

  /**
   * One RPC, with the response decoded.
   *
   * A response that is not decodable protobuf is a real failure and
   * propagates: it means the endpoint is not what it claimed to be, and every
   * record in it is suspect. Per-record decode failures are handled far more
   * gently, one record at a time, in toEntry.
   */
  async function call(method, request) {
    const body = await channel.unary(method, request);
    try {
      return decodeMessage(body);
    } catch (error) {
      throw new Error(
        `${method} answered something that is not a protobuf message: ${error.message}`,
      );
    }
  }

  /**
   * Every platform, as `{id, name, path}`.
   *
   * `with_metadata` (field 2) is asked for so a platform matched to IGDB
   * reports its proper name. On the measured instance the response carried no
   * metadata at all -- byte-identical with and without the flag, because
   * nothing had been matched -- so the name falls back to the library
   * directory's own name, which is what Retrom derives the platform from and
   * the only identifier it always has.
   */
  async function loadPlatforms() {
    const response = await call(GET_PLATFORMS, boolField(2, true));

    // PlatformMetadata: platform_id 1, name 2.
    const names = new Map();
    for (const entry of readMessages(response, 2)) {
      const platformId = readInt(entry, 1);
      const name = readString(entry, 2);
      if (platformId !== null && name) names.set(platformId, name);
    }

    // Platform: id 1, path 2, is_deleted 6.
    const platforms = [];
    for (const entry of readMessages(response, 1)) {
      const id = readInt(entry, 1);
      if (id === null) continue;
      // include_deleted was not requested, so this should never fire. Checked
      // anyway: a soft-deleted platform's games are not in the library, and
      // enumerating them would resurrect every one of them in the index.
      if (readInt(entry, 6, 0)) continue;

      const path = readString(entry, 2, "") ?? "";
      platforms.push({
        id,
        path,
        name: names.get(id) || basename(path) || String(id),
      });
    }
    return platforms;
  }

  /** The platform id -> name map, fetched once. */
  async function platformNameMap() {
    if (platformNames) return platformNames;
    const platforms = await loadPlatforms();
    platformNames = new Map(platforms.map((p) => [p.id, p.name]));
    return platformNames;
  }

  /**
   * Index a GetGamesResponse's side tables by game id.
   *
   * `metadata` (field 2) and `game_files` (field 3) are flat lists alongside
   * `games` (field 1), not nested inside them, so they have to be joined back
   * by id. A game with no metadata row is normal -- it means Retrom has not
   * matched it to a provider -- and produces no entry in the map.
   */
  function indexResponse(response) {
    // GameMetadata: game_id 1, name 2, cover_url 4, igdb_id 7.
    const metadata = new Map();
    for (const entry of readMessages(response, 2)) {
      const gameId = readInt(entry, 1);
      if (gameId !== null) metadata.set(gameId, entry);
    }

    // GameFile: byte_size 3, game_id 6, is_deleted 10. A game is one or many
    // files, so the size is the sum -- Retrom has no size on the Game itself.
    const sizes = new Map();
    for (const entry of readMessages(response, 3)) {
      const gameId = readInt(entry, 6);
      const byteSize = readInt(entry, 3);
      if (gameId === null || byteSize === null) continue;
      if (readInt(entry, 10, 0)) continue;
      sizes.set(gameId, (sizes.get(gameId) ?? 0) + byteSize);
    }

    return { metadata, sizes };
  }

  /**
   * One Game message as a LibraryEntry.
   *
   * @param {Map} game - Decoded Game
   * @param {Map} tables - As returned by indexResponse
   * @param {Map<number,string>} names - Platform id -> name
   * @returns {Object|null} - A LibraryEntry, or null when the record is unusable
   */
  function toEntry(game, tables, names) {
    const id = readInt(game, 1);
    if (id === null) return null;

    const meta = tables.metadata.get(id) ?? null;
    const path = readString(game, 3, "") ?? "";

    // GameMetadata.name when Retrom has matched the game, otherwise the file's
    // own name. normalizeEntry rejects an entry with no name, and a game with
    // no metadata row is the common case on an unmatched library -- the
    // measured instance had one of each -- so without this fallback half the
    // library would be dropped.
    const name = (meta && readString(meta, 2)) || basename(path);

    // igdb_id (field 7) is `optional int64` and was absent on every record of
    // the measured library, so this path emits null there. That is deliberate
    // and is the whole point: igdbId is what the index joins on, and a wrong id
    // silently marks unrelated games as owned. A missing badge is recoverable;
    // a wrong one is not. The field number itself comes from the server's own
    // descriptor, but it could not be exercised against a real value here.
    const igdbId = meta ? readInt(meta, 7) : null;

    const platformId = readInt(game, 4);

    return normalizeEntry({
      id,
      name,
      platformName:
        platformId === null ? null : (names.get(platformId) ?? null),
      igdbId,
      sizeBytes: tables.sizes.get(id) ?? null,
      // Game.created_at (field 5), a google.protobuf.Timestamp.
      //
      // Worth flagging because it contradicts the expectation this backend was
      // written to: Retrom's Game *does* carry a timestamp on 0.8.4. It is in
      // the server's own descriptor and it decoded to a plausible instant on
      // both live records (2026-07-30T13:04:41Z and 13:05:25Z, matching when
      // the library was seeded). updated_at is field 6 and is deliberately not
      // used -- it moves when a game is rescanned, which would reorder a
      // recently-added list on activity rather than on arrival.
      //
      // Still null-safe: the field is `optional`, and the index falls back to
      // first_seen_at for anything that reports nothing.
      addedAt: readTimestamp(game, 5),
      coverUrl: meta ? retromCoverUrl(publicUrl, readString(meta, 4)) : null,
      path: path || null,
    });
  }

  /**
   * Map a response's games, dropping any record too malformed to use.
   *
   * One bad record costs that record, not the enumeration. This matters more
   * here than on a REST backend: a partial sync never sets last_completed_at,
   * so throwing out of the middle of a walk leaves the index permanently
   * unreadable rather than merely one entry short.
   */
  function toEntries(response, names) {
    const tables = indexResponse(response);
    const entries = [];

    for (const game of readMessages(response, 1)) {
      // Game.is_deleted (field 8). include_deleted (request field 5) is never
      // sent, so Retrom already filters these; checked anyway, because
      // resurrecting deleted games into the index is invisible until someone
      // requests one.
      if (readInt(game, 8, 0)) continue;

      try {
        const entry = toEntry(game, tables, names);
        if (entry) entries.push(entry);
      } catch (error) {
        const reason =
          error instanceof ProtoError ? "undecodable" : error.message;
        console.warn("Skipping unusable Retrom record:", reason);
      }
    }
    return entries;
  }

  /** `GetGamesRequest` with metadata and files, for a set of platform ids. */
  function gamesByPlatform(platformId) {
    return concatBytes(
      packedVarints(1, [platformId]),
      boolField(3, true),
      boolField(4, true),
    );
  }

  return {
    kind: () => KIND,

    capabilities: () => new Set(RETROM_CAPABILITIES),

    /**
     * Reachability, shaped like probeRommAvailability's result so a caller can
     * treat the backends alike.
     *
     * `GetServerInfo` is the probe, deliberately rather than a `GET /`: Retrom
     * answers a static-file route on `/` that would still be there if the gRPC
     * services had failed to start, and it is the gRPC path every other call
     * depends on. The version is reported because it is the one thing that
     * makes a field-number mismatch diagnosable.
     */
    probe: async () => {
      const checkedAt = Date.now();
      try {
        const response = await call(GET_SERVER_INFO, new Uint8Array(0));
        // GetServerInfoResponse.server_info 1; ServerInfo.version 1;
        // Version major 1, minor 2, patch 3.
        const info = readMessages(response, 1)[0] ?? new Map();
        const version = readMessages(info, 1)[0] ?? new Map();
        const parts = [1, 2, 3].map((field) => readInt(version, field, 0) ?? 0);

        return {
          ok: true,
          status: 200,
          reason: null,
          version: parts.join("."),
          checkedAt,
        };
      } catch (error) {
        return {
          ok: false,
          status: error?.status ?? null,
          reason: error?.message ?? "unreachable",
          version: null,
          checkedAt,
        };
      }
    },

    listPlatforms: async () => {
      assertCapability(RETROM_CAPABILITIES, CAPABILITIES.LIST_PLATFORMS);

      const platforms = await loadPlatforms();
      return platforms.map((platform) => ({
        id: String(platform.id),
        name: platform.name,
      }));
    },

    /**
     * One game by its Retrom id.
     *
     * `GetGamesRequest.ids` (field 2) filters by game id, so this is the same
     * RPC as the listing with a different filter. An id Retrom does not know
     * comes back as an empty `games` list rather than an error, which is "no
     * such game" and yields null.
     */
    getEntry: async (id) => {
      assertCapability(RETROM_CAPABILITIES, CAPABILITIES.GET_BY_ID);

      const numeric = Number.parseInt(id, 10);
      if (!Number.isInteger(numeric)) {
        // Retrom ids are int32. A non-numeric id cannot exist rather than
        // merely being absent, and asking anyway would send a garbage filter.
        return null;
      }

      const response = await call(
        GET_GAMES,
        concatBytes(
          packedVarints(2, [numeric]),
          boolField(3, true),
          boolField(4, true),
        ),
      );

      const entries = toEntries(response, await platformNameMap());
      return entries.length > 0 ? entries[0] : null;
    },

    /**
     * Not implementable against this API. See the module docstring.
     *
     * Throws rather than returning something plausible-looking. `GetGames` has
     * no ordering and no search term, so any answer this could give would be
     * "the first N games Retrom happened to return", presented to a user as a
     * recently-added shelf or a search result. The router checks capabilities
     * and reads the local index instead; this path exists so that a caller that
     * forgot to check gets an error naming the backend and the capability
     * rather than a wrong page of games.
     */
    listEntries: async ({ search = null } = {}) => {
      assertCapability(
        RETROM_CAPABILITIES,
        search ? CAPABILITIES.SEARCH : CAPABILITIES.LIST_RECENT,
      );
      // Unreachable: neither capability is declared, so assertCapability always
      // throws above. Kept so the function has one obvious exit if that changes.
      return [];
    },

    /**
     * Enumerate the whole library, one platform at a time.
     *
     * ## Why per-platform
     *
     * `GetGames` cannot page -- there is no limit or offset field -- so the
     * only lever for bounding a response is the platform filter. An unfiltered
     * `GetGames` does work (measured: it returned every game), but it would
     * hold the entire library in one protobuf message, decode it in one go, and
     * scale with the library rather than with anything configurable. Walking
     * platform by platform bounds each response to one platform's worth, and
     * the walk terminates because `GetPlatforms` returns a finite list that is
     * read once up front.
     *
     * `batchSize` still means something: games accumulate into a buffer that is
     * flushed whenever it reaches batchSize, across platform boundaries, so
     * batches are full rather than one-per-platform. Peak memory is one
     * platform's response plus one batch.
     *
     * ## This backend can produce duplicate ids in one batch, and sync.js
     * ## dedupes for exactly that reason
     *
     * `upsertBatch` runs one INSERT ... ON CONFLICT per batch, and Postgres
     * raises `ON CONFLICT DO UPDATE command cannot affect row a second time`
     * if a single statement carries the same key twice -- which aborts the
     * pass, so last_completed_at is never written and the index never becomes
     * readable. `dedupeByLibraryId` exists to prevent that.
     *
     * Within one platform the ids are distinct, and `Game.platform_id` is
     * singular so a game belongs to one platform -- a title released on two
     * platforms is two Games with two different ids and is *not* a duplicate
     * key. The duplicate this backend really can produce is a race: the
     * enumeration is many RPCs, not one snapshot, and a library rescan between
     * the call for platform A and the call for platform B can move a game from
     * A to B. It is then returned by both, lands in one buffer, and can reach
     * one statement twice. Rare, and it costs the whole pass when it happens,
     * which is why the guard is upstream and unconditional rather than a
     * best-effort check here.
     *
     * A game with no `platform_id` at all is not reachable this way -- the
     * field is proto3-optional, so Retrom permits it. Retrom's own UI is
     * organised by platform and would not show such a game either; it is
     * recorded here as a known limit of the per-platform walk rather than
     * papered over with a second unfiltered pass that would double the cost of
     * every sync to catch a case that has never been observed.
     *
     * @param {Object} options
     * @param {number} [options.batchSize] - Entries per onBatch call
     * @param {Function} options.onBatch - Receives each batch
     */
    syncEntries: async ({ batchSize = 500, onBatch }) => {
      const platforms = await loadPlatforms();

      // Populate the name cache from the same listing rather than fetching it
      // again -- syncEntries is the one caller that already has it.
      platformNames = new Map(platforms.map((p) => [p.id, p.name]));

      const size =
        Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 500;
      let buffer = [];

      for (const platform of platforms) {
        const response = await call(GET_GAMES, gamesByPlatform(platform.id));

        for (const entry of toEntries(response, platformNames)) {
          buffer.push(entry);
          if (buffer.length >= size) {
            await onBatch(buffer);
            buffer = [];
          }
        }
      }

      // The remainder. Skipped when empty so a library that divides evenly into
      // batches does not end with a pointless empty upsert.
      if (buffer.length > 0) await onBatch(buffer);
    },
  };
}
