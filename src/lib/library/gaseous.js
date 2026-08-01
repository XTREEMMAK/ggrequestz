/**
 * Gaseous as a library backend.
 *
 * Unlike RomM, Gaseous has no server module in this codebase to delegate to,
 * so the transport lives here. It is deliberately small: one cookie, one
 * re-auth path, and no retry or breaker logic -- if Gaseous grows the traffic
 * that justifies those, they belong in a gaseous.server.js shared with
 * everything else, not duplicated per call site.
 *
 * Everything below was measured against a live gaseous-server, and where the
 * measurement contradicted either the documentation or ROM Hub's notes for the
 * 1.7.x line, the running server won and the disagreement is recorded. The
 * instance was **2.0.0-rc.3** (`AppVersion` 2.0.0.0, `DBSchemaVersion` 1042);
 * every claim of the form "Gaseous does X" below means "2.0.0-rc.3 was
 * observed doing X", and the 1.7.x differences that are known are flagged as
 * unverified rather than quietly assumed.
 *
 * ## Auth is a cookie, and 2.0 answers 401 rather than 302
 *
 * `POST /api/v1.1/Account/Login` takes JSON and answers `{"success":true}`
 * with a `Gaseous.Identity` cookie. There is no bearer token anywhere in
 * Gaseous, so the cookie is the credential and it has to be carried by hand --
 * `fetch` keeps no jar.
 *
 * ROM Hub's client records that an unauthenticated call to 1.7.x answers
 * **302**, a redirect to the login page, which turns into a 200 full of HTML
 * if redirects are followed. That is not what 2.0 does: measured, every
 * unauthenticated API call answers **401**, and it still answers 401 with
 * redirects enabled (`curl -L` ends on the API URL, not a login page). Both
 * are treated as "not authenticated" here, so this spans the two generations
 * without having to detect which one it is talking to.
 *
 * ## The listing is a POST, and paging is 1-based with no page zero
 *
 * `POST /Games` is the listing -- a POST because the filter travels in the
 * body -- and answers `{"games": [...]}`, plus `count` and `alphaList` when
 * `returnSummary` is on. This backend always turns the summary off.
 *
 * ROM Hub's client records that `pageNumber=0` means "no paging, return
 * everything" on the 1.7.x line. **That is not true on 2.0 and must not be
 * relied on.** Measured, with the summary off, which is how this backend
 * always calls it:
 *
 *     pageNumber=0&pageSize=100&returnSummary=false  ->  200 {"games":[]}
 *     pageNumber=0                                   ->  200, zero games
 *
 * while the library holds two. Page 0 is a silent empty list, which is a worse
 * failure than an error would be. So paging here always starts at page 1, and
 * `syncEntries` stops on an empty page and on a short page rather than asking
 * for everything at once.
 *
 * A 500 does exist in this area, and it is worth not mis-attributing: an
 * earlier reading of it blamed the page number, and it is the summary block.
 * `returnSummary` defaults to on, and with it on, a `pageSize` without a usable
 * `pageNumber` is a 500 -- including with no `pageNumber` key at all, where
 * page 0 is not involved:
 *
 *     pageNumber=0&pageSize=100                      ->  500
 *     pageSize=100          (no pageNumber at all)   ->  500
 *     pageNumber=0&pageSize=100&returnSummary=false  ->  200
 *
 * `fetchPage` always sends `returnSummary=false` and an explicit page number,
 * so this backend never reaches it.
 *
 * ## What a game record does and does not carry
 *
 * The listing returns `MinimalGameItem`. Its full property set, from the
 * server's own OpenAPI document and confirmed against live responses, is:
 * platformIds, id, metadataMapId, metadataSource, index, alpha, name, nameThe,
 * alternateNames, slug, summary, totalRating, totalRatingCount, hasSavedGame,
 * isFavourite, genres, themes, players, perspectives, firstReleaseDate, cover,
 * artworks, screenshots, ageRatings, ageGroup.
 *
 * There is **no size, no date-added and no file path** on a game, and that is
 * a property of the API rather than of the library that was measured. Those
 * live on a *rom*, and roms hang off games one call at a time
 * (`GET /Games/{MetadataMapId}/roms?PlatformId=<id>`) -- Gaseous has no
 * endpoint that lists the library's roms. Fetching them would cost one HTTP
 * call per game per platform on every sync, so a LibraryEntry here is a
 * **game**, and `sizeBytes` and `path` are null by construction rather than by
 * accident. `normalizeEntry` allows both to be null.
 *
 * `addedAt` is null for a subtler reason worth writing down: Gaseous can
 * *sort* by date added (`SortBy: "DateAdded"`, and the sort demonstrably
 * works) but never *returns* the value, on a game or on a rom. The index's
 * `first_seen_at` covers this -- router.js orders by
 * `COALESCE(added_at, first_seen_at)` precisely so a backend that reports no
 * timestamp still sorts stably.
 */

import {
  CAPABILITIES,
  CapabilityUnsupported,
  LIST_ORDERS,
  normalizeEntry,
} from "./types.js";

const KIND = "gaseous";

/** Gaseous' API prefix. Both generations answer `/api/v1.1`. */
const API = "/api/v1.1";

/**
 * Every capability, each one measured against the live instance:
 *
 * - SYNC          `POST /Games` pages: pageSize=1 returned page1=[a], page2=[b],
 *                 page3=[] -- so the walk both advances and terminates.
 * - LIST_RECENT   `SortBy:"DateAdded"` with `SortAscending` true vs false
 *                 returned the two games in opposite orders, and the
 *                 descending order matched the newer `DateCreated` first.
 * - SEARCH        `Name:"proof"` returned 1 of 2 games; `Name:"zzzznomatch"`
 *                 returned `{"count":0,"games":[]}`. See the prefix note on
 *                 listEntries -- the match is real but anchored.
 * - GET_BY_ID     `GET /Games/1` returned the game, `GET /Games/99` returned
 *                 404.
 * - LIST_PLATFORMS `GET /Platforms` returned 146 platforms with id/name/slug.
 *
 * Handed out as a copy rather than frozen: Object.freeze on a Set freezes its
 * own properties and leaves `add` working, so a frozen Set is not immutable.
 */
const GASEOUS_CAPABILITIES = [
  CAPABILITIES.SYNC,
  CAPABILITIES.LIST_RECENT,
  CAPABILITIES.SEARCH,
  CAPABILITIES.GET_BY_ID,
  CAPABILITIES.LIST_PLATFORMS,
];

/**
 * The `POST /Games` filter body, sent in a form both API generations accept.
 *
 * 2.0 rejects `{}` with `400 {"errors":{"Name":["The Name field is
 * required."],"Sorting":["The Sorting field is required."]}}` -- measured. The
 * 1.7.x line additionally requires Platform, Genre, GameMode,
 * PlayerPerspective and Theme, because it builds with nullable reference types
 * enabled and ASP.NET treats a non-nullable reference property as implicitly
 * required. Sending the union satisfies both, and a field a server does not
 * declare is ignored by System.Text.Json rather than rejected -- which is why
 * this is one body instead of a version switch with nothing to detect it by.
 *
 * The empty lists mean "any", not "match nothing": `GetGames` guards each with
 * a `.Count > 0` test, so an empty list contributes no WHERE clause. They must
 * be `[]` and not `null` -- an explicit null fails 1.7.x validation exactly as
 * an absent key does, because implicit-required tests the bound value.
 *
 * `Sorting` is required too, but it varies per call and `fetchPage` is the only
 * caller, so `fetchPage` supplies it. It is not defaulted here as well: a value
 * every caller overwrites reads like a fallback that something might use.
 */
function matchEverything() {
  return {
    Name: "",
    Platform: [],
    Genre: [],
    GameMode: [],
    PlayerPerspective: [],
    Theme: [],
  };
}

/**
 * `SortBy` is a validated enum, not free text.
 *
 * Measured: `SortBy:"TotallyBogusField"` answers 400 with "The JSON value
 * could not be converted to ... SortField". The accepted set, from the
 * server's OpenAPI document, is Name, NameThe, Rating, RatingCount, DateAdded,
 * LastPlayed, TimePlayed, ReleaseDate.
 */
const SORT_DATE_ADDED = "DateAdded";
const SORT_NAME = "NameThe";

/**
 * Throw when a capability was not declared.
 *
 * Exported, and that is deliberate. Gaseous declares every capability, so this
 * has no reachable path in production -- and a guard that is never exercised
 * is a guard nobody has shown to work. Exporting it lets the contract be
 * tested directly instead of being asserted by inspection.
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
 * A Gaseous API failure, carrying the status so callers can tell 404 from 500.
 */
class GaseousError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "GaseousError";
    this.status = status;
  }
}

/** Trim a body down to something loggable. */
async function excerpt(response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "<unreadable response body>";
  }
}

/**
 * Pull the identity cookie out of a login response.
 *
 * `getSetCookie()` is the only correct reader here: `headers.get("set-cookie")`
 * folds multiple cookies into one comma-joined string, and a cookie value
 * containing a comma then cannot be split back apart. It exists in Node 20+;
 * the fallback is for anything older and keeps only the first pair.
 */
function readSessionCookie(response) {
  const all =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  const pairs = [];
  for (const line of all) {
    const pair = String(line).split(";")[0].trim();
    if (pair) pairs.push(pair);
  }
  return pairs.length > 0 ? pairs.join("; ") : null;
}

/**
 * Build the Gaseous backend.
 *
 * @param {Object} config - As returned by resolveLibraryConfig()
 * @param {string} config.url - Base URL of the Gaseous server
 * @param {string} config.username - Account e-mail
 * @param {string} config.password - Account password
 * @param {Function} [config.fetch] - Transport, for tests. Defaults to global
 *   fetch; the suite injects a stub rather than starting a server.
 * @returns {Object} - A GameLibrary
 */
export function createGaseousLibrary(config) {
  const baseUrl = String(config?.url ?? "").replace(/\/+$/, "");
  const username = config?.username;
  const password = config?.password;
  const transport = config?.fetch ?? globalThis.fetch;

  /** The `Gaseous.Identity` cookie, once logged in. */
  let cookie = null;
  /** platform id -> name, filled lazily by GET /Platforms. */
  let platformNames = null;

  function requireConfigured() {
    if (!baseUrl) {
      throw new GaseousError(
        "Gaseous is not configured: set LIBRARY_URL to the server's address",
      );
    }
    if (!username || !password) {
      throw new GaseousError(
        "Gaseous is not configured: set LIBRARY_USERNAME and LIBRARY_PASSWORD. " +
          "Gaseous has no API token, so the account credentials are the only way in.",
      );
    }
  }

  /**
   * Log in and keep the cookie.
   *
   * A 2FA-enabled account answers 200 with `{"requiresTwoFactor":true}`, which
   * is *not* a successful login. Reporting it as one leaves a backend that
   * believes it is authenticated and then fails every subsequent call, so it
   * is rejected explicitly.
   */
  async function authenticate() {
    requireConfigured();

    const response = await transport(`${baseUrl}${API}/Account/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Gaseous validates this field as an e-mail address on the 1.7.x line
      // and rejects a bare username with 400; 2.0 answers 401 for both a wrong
      // password and a non-e-mail username. Either way the account's e-mail is
      // what belongs in LIBRARY_USERNAME.
      body: JSON.stringify({
        Email: username,
        Password: password,
        RememberMe: true,
      }),
      redirect: "manual",
    });

    if (!response.ok) {
      throw new GaseousError(
        `Gaseous rejected the credentials (${response.status}): ${await excerpt(response)}. ` +
          "LIBRARY_USERNAME must be the account's e-mail address, not its username.",
        response.status,
      );
    }

    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (body?.requiresTwoFactor) {
      throw new GaseousError(
        "Gaseous accepted the password but requires a two-factor code, which " +
          "this backend cannot supply. Use an account with 2FA disabled.",
      );
    }

    cookie = readSessionCookie(response);
    if (!cookie) {
      throw new GaseousError(
        "Gaseous reported a successful login but set no identity cookie, so " +
          "no subsequent call can be authenticated.",
      );
    }
  }

  /**
   * One authenticated request, logging in first and re-authenticating once.
   *
   * The retry exists because the cookie outlives the process's knowledge of
   * it: Gaseous can expire or invalidate a session at any time, and the only
   * way that surfaces is the next call failing. Retried exactly once, so a
   * genuinely bad credential fails instead of looping.
   *
   * 301/302/307 are folded in with 401/403 on purpose. 2.0 answers 401, but
   * the 1.7.x line answers 302 -- a redirect to the login form -- and reading
   * that as success is how an HTML login page ends up being parsed as JSON.
   * `redirect: "manual"` keeps it a 302 instead of a 200 full of HTML.
   */
  async function request(path, { method = "GET", body = null } = {}) {
    requireConfigured();
    if (!cookie) await authenticate();

    const send = async () => {
      const init = {
        method,
        headers: { Cookie: cookie },
        redirect: "manual",
      };
      if (body !== null) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      return transport(`${baseUrl}${API}${path}`, init);
    };

    let response = await send();

    if ([301, 302, 307, 401, 403].includes(response.status)) {
      cookie = null;
      await authenticate();
      response = await send();
      if ([301, 302, 307, 401, 403].includes(response.status)) {
        throw new GaseousError(
          `${method} ${path} failed: not authenticated to Gaseous (${response.status}). ` +
            "The identity cookie was rejected; check LIBRARY_USERNAME / LIBRARY_PASSWORD.",
          response.status,
        );
      }
    }

    if (!response.ok) {
      throw new GaseousError(
        `${method} ${path} failed (${response.status}): ${await excerpt(response)}`,
        response.status,
      );
    }

    return response;
  }

  /** JSON from an authenticated request. */
  async function requestJson(path, options) {
    const response = await request(path, options);
    try {
      return await response.json();
    } catch {
      throw new GaseousError(`${path} did not return JSON`);
    }
  }

  /**
   * platform id -> name, fetched once.
   *
   * A game carries `platformIds` (integers) and no platform name, so the
   * listing needs this map to fill `platformName` at all. Failure is not
   * fatal: an entry with no platform name is still a usable entry, and losing
   * the whole sync because a secondary lookup failed would be a poor trade.
   */
  async function loadPlatformNames() {
    if (platformNames) return platformNames;

    try {
      const platforms = await requestJson("/Platforms");
      const map = new Map();
      for (const platform of Array.isArray(platforms) ? platforms : []) {
        if (typeof platform?.id === "number" && platform?.name) {
          map.set(platform.id, String(platform.name));
        }
      }
      platformNames = map;
      return platformNames;
    } catch (error) {
      console.warn(
        "Could not load Gaseous platforms; entries will have no platform name:",
        error.message,
      );

      // Deliberately not cached. `platformNames` stays null so the next call
      // tries again, and only this listing loses its platform names.
      //
      // Caching the empty map made one transient failure permanent, because
      // getLibrary() caches this backend for the life of the process: a single
      // 500 from /Platforms and every later call answered from an empty map.
      // That is not merely a degraded listing -- upsertBatch's ON CONFLICT sets
      // `platform_name = EXCLUDED.platform_name` unconditionally, so the next
      // sync pass would write NULL over the platform names already in the
      // index, and the pass after that would do it again. Nothing heals it
      // short of restarting the process. One retry per listing, or per sync
      // pass, is much the cheaper mistake.
      return new Map();
    }
  }

  /**
   * The IGDB id for a game, or null.
   *
   * **This gate is the load-bearing line in the file.** A game record carries
   * `id` and `metadataMapId`, and on the measured instance they were equal for
   * every game -- which makes it tempting, and wrong, to treat `id` as an IGDB
   * id unconditionally.
   *
   * What `id` actually is: the id of the game *in whatever metadata source
   * matched it*. The database makes this explicit -- `MetadataMapBridge` keys a
   * game on (ParentMapId, MetadataSourceType, MetadataSourceId), and the
   * listing's `metadataMapId` is ParentMapId while its `id` is
   * MetadataSourceId. So `id` is an IGDB id exactly when the source is IGDB,
   * and is a meaningless local counter when it is not.
   *
   * On the measured instance every game had `metadataSource: "None"` (the
   * server had no IGDB credentials), and both games had `id` 1 and 2. IGDB
   * games 1 and 2 are real and unrelated, so emitting those as igdbIds would
   * have cross-referenced two local ROMs against two arbitrary IGDB titles --
   * silently, and in the one field the whole index exists to join on. Null is
   * the only safe answer for a non-IGDB source.
   *
   * The `metadataSource` enum, from the server's OpenAPI document, is: None,
   * IGDB, TheGamesDb, RetroAchievements, GiantBomb, Steam, GOG, EpicGameStore,
   * Wikipedia, SteamGridDb, ScreenScraper, Launchbox, Hasheous, Unknown.
   *
   * **Unproven, and deliberately so:** the IGDB branch could not be exercised,
   * because reaching it needs a Gaseous with Twitch/IGDB credentials and the
   * instance had none -- every game was `"None"`. The mapping is inferred from
   * the schema above rather than observed. It fails closed: an unexpected
   * source spelling yields null, which costs a cross-reference, where a wrong
   * id would corrupt one.
   *
   * The id is checked as well as the source, and that is not belt-and-braces.
   * Gaseous uses **0 as its unset sentinel throughout this API** -- measured on
   * the live instance: `cover: 0`, `franchise: 0`, `parent_game: 0`,
   * `version_parent: 0`, `platformIds: [0]` for Unknown Platform, and
   * MetadataSourceType 0 for None. So `id: 0` under an IGDB source means "no
   * IGDB id", not IGDB game 0, and real IGDB ids start at 1. Testing only for
   * `undefined` let that sentinel through as the string "0" -- a value that is
   * neither null nor a real id, in the one column entriesByIgdbIds joins on.
   */
  function igdbIdOf(game) {
    if (game?.metadataSource !== "IGDB") return null;

    const id = Number(game.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /**
   * One Gaseous game, in the seam's vocabulary.
   *
   * The id is `metadataMapId`, not `id`. Two reasons, and they agree: it is
   * the primary key of `MetadataMap`, so it is stable and unique per game
   * regardless of metadata source; and it is what every by-id route takes --
   * the server's OpenAPI document names the path parameter `MetadataMapId`
   * literally, in `GET /Games/{MetadataMapId}`. Indexing on `id` would key the
   * index on a value that is only unique within one metadata source.
   *
   * @param {Object} game - A MinimalGameItem, or a game detail record
   * @param {Map<number, string>} platforms - id -> name
   */
  function toEntry(game, platforms) {
    const platformId = Array.isArray(game?.platformIds)
      ? game.platformIds[0]
      : undefined;

    return normalizeEntry({
      id: game?.metadataMapId,
      name: game?.name || game?.nameThe,
      // A game can span platforms -- `platformIds` is an array -- and a
      // LibraryEntry holds one name, so this reports the first. The detail
      // record returned by GET /Games/{id} carries no platformIds at all, so
      // getEntry yields null here; measured, not assumed.
      platformName:
        platformId === undefined ? null : (platforms.get(platformId) ?? null),
      igdbId: igdbIdOf(game),
      // Null by construction. See the header: size and path are rom-level and
      // cost one HTTP call per game per platform, and no date-added is exposed
      // anywhere in the API even though the server can sort by it.
      sizeBytes: null,
      addedAt: null,
      // Null, and not for want of a route. The OpenAPI document offers
      // `GET /Games/{MetadataMapId}/{MetadataSource}/cover`, but every game on
      // the measured instance had `cover: 0` and every spelling of that route
      // answered 404, so no cover URL was ever observed to work. coverUrl is
      // persisted and rendered as an <img src>, so guessing it would put
      // broken images in the UI and in the index. To finish this: point a
      // Gaseous with IGDB credentials at a matched game and confirm a 200 from
      // that route before building the URL here.
      coverUrl: null,
      path: null,
    });
  }

  /**
   * Map a page of games, dropping any record too malformed to use.
   *
   * One bad record must not cost the whole page, and it is logged rather than
   * swallowed -- a silently shorter page is indistinguishable from a smaller
   * library, which is exactly the signal the sweep guard reads.
   */
  function toEntries(games, platforms) {
    const entries = [];
    for (const game of games ?? []) {
      try {
        entries.push(toEntry(game, platforms));
      } catch (error) {
        console.warn("Skipping unusable Gaseous record:", error.message);
      }
    }
    return entries;
  }

  /**
   * One page of the listing.
   *
   * @param {Object} options
   * @param {number} options.pageNumber - 1-based. There is no page 0 -- see
   *   the header; asking for one answers 500 or an empty list depending on
   *   whether a page size came with it.
   * @param {number} options.pageSize
   * @param {string|null} options.search
   * @param {string|null} options.sortBy
   * @param {boolean} options.ascending
   * @returns {Promise<Array>} The raw games array, possibly empty
   */
  async function fetchPage({
    pageNumber,
    pageSize,
    search = null,
    sortBy = SORT_NAME,
    ascending = true,
  }) {
    const body = matchEverything();
    if (search) body.Name = search;
    body.Sorting = { SortBy: sortBy, SortAscending: ascending };

    const params = new URLSearchParams({
      pageNumber: String(pageNumber),
      pageSize: String(pageSize),
      returnSummary: "false",
      returnGames: "true",
    });

    const payload = await requestJson(`/Games?${params}`, {
      method: "POST",
      body,
    });

    // `games` is absent rather than empty when nothing matches, so this reads
    // a missing key as "no results" instead of as a malformed response.
    return Array.isArray(payload?.games) ? payload.games : [];
  }

  return {
    kind: () => KIND,

    capabilities: () => new Set(GASEOUS_CAPABILITIES),

    /**
     * Is Gaseous reachable and are the credentials good?
     *
     * Shaped like probeRommAvailability's result so a caller can treat the two
     * alike. A login is the probe: it is the cheapest call that distinguishes
     * "server down" from "credentials wrong", and both are worth telling apart
     * in an admin UI.
     */
    probe: async () => {
      const checkedAt = Date.now();
      try {
        cookie = null;
        await authenticate();
        return { ok: true, status: 200, reason: null, checkedAt };
      } catch (error) {
        return {
          ok: false,
          status: error?.status ?? null,
          reason: error?.message ?? "unreachable",
          checkedAt,
        };
      }
    },

    listPlatforms: async () => {
      assertCapability(GASEOUS_CAPABILITIES, CAPABILITIES.LIST_PLATFORMS);

      const platforms = await requestJson("/Platforms");
      return (Array.isArray(platforms) ? platforms : [])
        .filter((platform) => platform?.id !== undefined && platform?.name)
        .map((platform) => ({
          id: String(platform.id),
          name: String(platform.name),
        }));
    },

    /**
     * One game by its MetadataMapId.
     *
     * A 404 is "no such game" and yields null; anything else is a real
     * failure and propagates.
     */
    getEntry: async (id) => {
      assertCapability(GASEOUS_CAPABILITIES, CAPABILITIES.GET_BY_ID);

      let game;
      try {
        game = await requestJson(`/Games/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
      if (!game) return null;

      const platforms = await loadPlatformNames();
      try {
        return toEntry(game, platforms);
      } catch (error) {
        // Logged, not returned as a bare null: a malformed record and a 404
        // are different problems and must not look the same to the caller.
        console.warn(
          `Skipping unusable Gaseous record for id ${id}:`,
          error.message,
        );
        return null;
      }
    },

    /**
     * A window of the library.
     *
     * Gaseous pages by page number and has no offset, so an offset has to be
     * emulated. When it lands on a page boundary -- which is what the router
     * does, stepping by `limit` -- this is one page and costs nothing. When it
     * does not, the window straddles two pages and the only correct answer is
     * to ask for everything up to the end of it and slice, because there is no
     * page whose first row is the requested offset.
     *
     * The search term is anchored, and this is the surprise worth knowing:
     * Gaseous matches `Name` as a **prefix**, not a substring, case-
     * insensitively. Measured against a library holding "proofseed" and
     * "romhubproof20260730130456": "proof" -> proofseed only, "proofs" ->
     * proofseed, "PROOF" -> proofseed, "romhub" -> the other one, "seed" -> no
     * results, "oofseed" -> no results. So searching a word from the middle of
     * a title finds nothing.
     *
     * SEARCH is still declared, because the seam's fallback when it is absent
     * is to return nothing at all: a backend that does not declare it gets
     * `{indexBuilding: true, entries: []}` from router.js. Anchored results
     * beat no results.
     *
     * Be careful how long "that window" is, though, because the obvious reading
     * is too generous. router.js reaches a backend search only until the first
     * sync completes and answers from the index with `name ILIKE '%term%'`
     * afterwards -- but the index is opt-in and off by default
     * (`LIBRARY_SYNC_ENABLED` must be the literal string "true"). On a default
     * install no sync ever runs, so this is not a transient pre-index
     * limitation: it is what Gaseous search does, permanently, until an
     * operator turns the index on. That is worth saying plainly rather than
     * describing as a window, and it is why the operator-facing docs say so
     * too.
     */
    listEntries: async ({
      limit = 24,
      offset = 0,
      search = null,
      order = LIST_ORDERS.RECENT,
    } = {}) => {
      assertCapability(
        GASEOUS_CAPABILITIES,
        search ? CAPABILITIES.SEARCH : CAPABILITIES.LIST_RECENT,
      );

      // RELEVANCE means "leave the backend's own ordering alone". Gaseous has
      // no relevance ranking to leave alone -- the Name filter is a SQL
      // comparison, and Sorting is required, so omitting it is a 400 rather
      // than a natural order. NameThe ascending is the closest thing it has to
      // an unopinionated default, and it is what the UI shows unsorted.
      const recent = order === LIST_ORDERS.RECENT;
      const sortBy = recent ? SORT_DATE_ADDED : SORT_NAME;
      const ascending = !recent;

      const aligned = offset % limit === 0;
      const games = await fetchPage({
        pageNumber: aligned ? Math.floor(offset / limit) + 1 : 1,
        pageSize: aligned ? limit : offset + limit,
        search,
        sortBy,
        ascending,
      });

      const window = aligned ? games : games.slice(offset);
      return toEntries(window, await loadPlatformNames());
    },

    /**
     * Walk the whole library, a page at a time.
     *
     * Termination is on the pages themselves and never on a reported total:
     * an empty page ends the walk, and so does a short one. Gaseous can report
     * a total -- `count`, in the summary block -- and trusting it is the
     * failure this avoids, because a count that disagrees with what the pages
     * actually yield loops forever against a live server. `fetchPage` sends
     * `returnSummary=false`, so there is not even a count in the response to be
     * tempted by.
     *
     * There is no page 0 shortcut here even though ROM Hub's notes record one
     * for the 1.7.x line. Measured on 2.0, page 0 is a silent empty list; see
     * the module header, including which request actually produces the 500 that
     * was once attributed to it.
     *
     * On duplicate ids within one batch, and stated more carefully than it once
     * was: an entry's id is `metadataMapId`, which is the primary key of
     * `MetadataMap`, and every listing measured returned each game once. But
     * the listing's `id` and `metadataSource` come from `MetadataMapBridge`,
     * whose own primary key is (ParentMapId, MetadataSourceType,
     * MetadataSourceId) -- so several bridge rows may share one ParentMapId,
     * and this server declares three usable sources (None, IGDB, TheGamesDb).
     * Whether `GetGames` collapses those to the `Preferred` row cannot be shown
     * on a library where every game has exactly one bridge row, which is all
     * that was available. So this backend is *not* claimed to be
     * duplicate-free.
     *
     * It does not need to be. `upsertBatch` runs every batch from every backend
     * through `dedupeByLibraryId` before the `ON CONFLICT` statement, precisely
     * so that no backend has to make this promise -- see the "collapses a
     * library_id that appears twice in one batch" test in library-sync. That is
     * what keeps "cannot affect row a second time" out of reach, here and
     * everywhere else.
     */
    syncEntries: async ({ batchSize = 500, onBatch }) => {
      assertCapability(GASEOUS_CAPABILITIES, CAPABILITIES.SYNC);

      const platforms = await loadPlatformNames();
      let pageNumber = 1;

      for (;;) {
        const games = await fetchPage({
          pageNumber,
          pageSize: batchSize,
          // NameThe ascending, and it is worth being straight about what that
          // does and does not buy. The ideal sort key for a walk is the stable
          // local id, because a library that changes mid-walk reorders any
          // other sort under the pager and so drops and repeats entries.
          // Gaseous does not offer one: `SortBy` is a validated enum and its
          // whole accepted set is Name, NameThe, Rating, RatingCount,
          // DateAdded, LastPlayed, TimePlayed, ReleaseDate. Nothing there is
          // stable under insertion. NameThe is the least volatile of them -- a
          // title changes far less often than a rating or a last-played time --
          // so it is chosen as the best available, not as a solution. An entry
          // missed because of a concurrent insert is picked up by the next
          // pass, and the sweep's ratio guard is what stops a bad walk from
          // emptying the index in the meantime.
          sortBy: SORT_NAME,
          ascending: true,
        });

        if (games.length === 0) return;

        await onBatch(toEntries(games, platforms));

        if (games.length < batchSize) return;
        pageNumber += 1;
      }
    },
  };
}
