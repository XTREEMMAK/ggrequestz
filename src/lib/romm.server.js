/**
 * ROMM API client for accessing local game library
 * Integrates with self-hosted ROMM instance for recently added games
 */

import { browser } from "$app/environment";
import { getGameById } from "./gameCache.js";
import { fetchWithTimeout, isTimeoutOrNetworkError } from "./utils.js";

// Outbound deadlines. Nothing here may block unbounded — ROMM is typically
// reached over a public URL, so a slow or unreachable instance previously
// stalled every request that touched it.
const AUTH_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
// Hard ceiling across all retries for a single logical request.
const TOTAL_BUDGET_MS = 12000;

// Renew this far ahead of the stated expiry so a request never leaves carrying
// a token that dies in transit.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
// RomM's password grant issues a 30-minute token. When the response omits the
// lifetime, assume less than that rather than more.
const DEFAULT_TOKEN_TTL_MS = 25 * 60 * 1000;

// Configuration variables
let ROMM_SERVER_URL, ROMM_SERVER_URL_PUBLIC;
let ROMM_USERNAME, ROMM_PASSWORD, ROMM_API_TOKEN;

// Lazy load environment variables only when needed on server
async function loadEnvironmentVariables() {
  if (browser) {
    throw new Error("Environment variables cannot be loaded in browser");
  }

  if (ROMM_SERVER_URL !== undefined) {
    return; // Already loaded
  }

  const { env } = await import("$env/dynamic/private");
  ROMM_SERVER_URL = env.ROMM_SERVER_URL || process.env.ROMM_SERVER_URL;
  // Browser-facing base for "Play in ROMM" links and cover images. On
  // Kubernetes or any split-network setup, ROMM_SERVER_URL is an internal
  // service address the browser cannot resolve. Falls back to ROMM_SERVER_URL,
  // so single-network deployments need no new configuration. Issue #2.
  ROMM_SERVER_URL_PUBLIC =
    env.ROMM_SERVER_URL_PUBLIC ||
    process.env.ROMM_SERVER_URL_PUBLIC ||
    ROMM_SERVER_URL;
  ROMM_USERNAME = env.ROMM_USERNAME || process.env.ROMM_USERNAME;
  ROMM_PASSWORD = env.ROMM_PASSWORD || process.env.ROMM_PASSWORD;
  // RomM 5.0+ Client API Token ("rmm_"-prefixed). Preferred over the password
  // grant: it carries an explicit scope set, does not expire every 30 minutes,
  // and means the ROMM account password never has to be stored here.
  ROMM_API_TOKEN = env.ROMM_API_TOKEN || process.env.ROMM_API_TOKEN;
}

// Session token storage for authenticated requests.
//
// `expiresAt` is the epoch-ms after which the token must not be reused. This
// used to be a bare token with no expiry: the password grant's 30-minute token
// would lapse, RomM would answer with 500 rather than 401, and because the only
// invalidation path was an exact 401 the dead token was re-sent forever. The
// worker stayed poisoned until the process restarted.
let session = { token: null, expiresAt: 0 };

// Single-flight guard. Without it, every concurrent request on a worker whose
// token has just lapsed fires its own /api/token call.
let authInFlight = null;

// Whether the "RomM did not state a token lifetime" fallback has been reported.
// It is worth knowing once per process, not once every renewal.
let warnedAboutMissingTtl = false;

/**
 * Clear ROMM session token to force re-authentication
 */
export function clearRommSession() {
  if (browser) throw new Error("clearRommSession is server-only");
  session = { token: null, expiresAt: 0 };
}

/**
 * Whether the cached token is present and not within the renewal margin.
 * A Client API Token has `expiresAt: Infinity` and is always usable.
 * @returns {boolean}
 */
function hasUsableToken() {
  return (
    !!session.token && Date.now() < session.expiresAt - TOKEN_REFRESH_MARGIN_MS
  );
}

/**
 * Whether re-authenticating could plausibly yield a *different* credential.
 *
 * A Client API Token is a fixed string read from the environment, so asking for
 * it again returns the same value. And when RomM has already told us this
 * account lacks `roms.read`, a fresh token will lack it too — replaying would
 * only double the load on a server that is answering correctly.
 *
 * @returns {boolean}
 */
function canRenewCredential() {
  return !ROMM_API_TOKEN && !session.lacksReadScope;
}

/**
 * Return a usable bearer token, authenticating only when necessary.
 *
 * Concurrent callers share a single in-flight authentication rather than each
 * issuing their own.
 *
 * @param {boolean} forceRefresh - Discard the cached token first
 * @returns {Promise<string|null>} - Bearer token, or null if unconfigured
 */
async function getSessionToken(forceRefresh = false) {
  if (forceRefresh) {
    session = { token: null, expiresAt: 0 };
  }

  if (hasUsableToken()) {
    return session.token;
  }

  // An authentication already in progress is always fetching a fresh token, so
  // it satisfies a forced refresh too.
  if (authInFlight) {
    return authInFlight;
  }

  authInFlight = (async () => {
    try {
      const issued = await authenticateROMM();
      session = issued;
      return issued.token;
    } finally {
      authInFlight = null;
    }
  })();

  return authInFlight;
}

/**
 * Authenticate with ROMM API using token endpoint
 * @returns {Promise<{token: string|null, expiresAt: number}>} - Token and the
 *   epoch-ms it lapses at. `Infinity` for credentials that never expire.
 */
async function authenticateROMM() {
  if (browser) throw new Error("authenticateROMM is server-only");

  await loadEnvironmentVariables();

  // A Client API Token is used verbatim as the bearer credential — there is no
  // token exchange to perform, and no expiry to track.
  if (ROMM_API_TOKEN) {
    return { token: ROMM_API_TOKEN, expiresAt: Infinity };
  }

  if (!ROMM_SERVER_URL || !ROMM_USERNAME || !ROMM_PASSWORD) {
    console.warn(
      "⚠️ ROMM server URL or credentials not configured - ROMM features disabled",
    );
    return { token: null, expiresAt: 0 };
  }

  try {
    const response = await fetchWithTimeout(
      `${ROMM_SERVER_URL}/api/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "password",
          username: ROMM_USERNAME,
          password: ROMM_PASSWORD,
          scope: "roms.read",
        }),
      },
      AUTH_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errorText = await response.text();

      // RomM rejects the token request outright when the account lacks a
      // requested scope — verified against RomM 5.0.0, which answers
      // 403 {"detail":"Insufficient scope"}. This is the exact failure a
      // RomM 5.0 permission change produces, so name the remedy rather than
      // dumping a bare status line.
      if (response.status === 403 && /insufficient scope/i.test(errorText)) {
        const err = new Error(
          "ROMM denied the 'roms.read' scope for this account",
        );
        err.status = 403;
        err.reason = "insufficient_scope";
        console.error(
          "🚫 ROMM refused to issue a token: the account lacks the 'roms.read' scope. " +
            "In the ROMM admin UI grant this user's permission group read access to ROMs " +
            "(RomM 5.0 introduced per-user/per-group permissions and may have revoked it on upgrade), " +
            "or set ROMM_API_TOKEN to a Client API Token that carries roms.read.",
        );
        throw err;
      }

      console.error(
        `ROMM authentication failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
      const err = new Error(
        `ROMM authentication failed: ${response.status} ${response.statusText}`,
      );
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const token = data.access_token;

    if (!token) {
      console.error("No access token received from ROMM API");
      return { token: null, expiresAt: 0 };
    }

    const lacksReadScope = warnIfMissingReadScope(token);

    // RomM reports the lifetime as `expires_in`; older builds use `expires`.
    // Both are seconds.
    const ttlSeconds = Number(data.expires_in ?? data.expires);
    const hasTtl = Number.isFinite(ttlSeconds) && ttlSeconds > 0;

    if (!hasTtl && !warnedAboutMissingTtl) {
      warnedAboutMissingTtl = true;
      console.warn(
        `⚠️ ROMM issued a token without stating a lifetime; assuming ${
          DEFAULT_TOKEN_TTL_MS / 60000
        } minutes. Set ROMM_API_TOKEN to a Client API Token to avoid expiry entirely.`,
      );
    }

    const ttlMs = hasTtl ? ttlSeconds * 1000 : DEFAULT_TOKEN_TTL_MS;

    return { token, expiresAt: Date.now() + ttlMs, lacksReadScope };
  } catch (error) {
    // Propagate HTTP-level failures so callers can classify them (a 403 needs
    // a different message and a different fix than an unreachable host).
    // Only genuinely unexpected errors degrade to null.
    if (error?.status) throw error;

    console.error("ROMM authentication error:", error);
    throw error;
  }
}

/**
 * Warn when RomM issued a token without library-read permission.
 *
 * RomM grants the *intersection* of the requested scopes and what the account
 * actually has, so a user who has lost `roms.read` still receives HTTP 200 and
 * a perfectly valid token here — every subsequent library call then fails with
 * 403. RomM 5.0's group-based permission system made this easy to fall into.
 *
 * The payload is only inspected for diagnostics; it is never trusted, so no
 * signature verification is required.
 *
 * @param {string} token - Access token returned by ROMM
 * @returns {boolean} - True only when the token definitively lacks `roms.read`
 */
function warnIfMissingReadScope(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;

    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const scopes =
      typeof claims.scopes === "string"
        ? claims.scopes.split(/\s+/).filter(Boolean)
        : Array.isArray(claims.scopes)
          ? claims.scopes
          : null;

    if (scopes && !scopes.includes("roms.read")) {
      console.error(
        `🚫 ROMM issued a token WITHOUT the 'roms.read' scope (granted: ${
          scopes.length ? scopes.join(", ") : "none"
        }). Library requests will fail with 403. Grant this account library ` +
          `read access in the ROMM admin UI (Settings → Users), or use a ` +
          `Client API Token via ROMM_API_TOKEN.`,
      );
      return true;
    }
  } catch {
    // Non-JWT or unexpected shape — nothing to diagnose, carry on.
  }

  return false;
}

/**
 * Make authenticated request to ROMM API using Bearer token with retry logic
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {Object} options - Fetch options
 * @param {string} cookies - Optional cookies to forward (for same-domain auth)
 * @param {number} retryCount - Number of retries attempted (internal)
 * @param {number|null} deadline - Absolute epoch-ms ceiling shared by all
 *   attempts of one logical request (internal)
 * @param {boolean} reauthorized - Whether this logical request has already
 *   spent its single re-authentication (internal)
 * @returns {Promise<Object>} - API response
 */
async function rommRequest(
  endpoint,
  options = {},
  cookies = null,
  retryCount = 0,
  deadline = null,
  reauthorized = false,
) {
  await loadEnvironmentVariables();

  if (!ROMM_SERVER_URL) {
    throw new Error("ROMM server URL not configured");
  }

  // A single absolute deadline is threaded through every retry. Previously each
  // attempt had its own escalating timeout with no overall ceiling, so a slow
  // ROMM could hold a request for ~57s.
  const budget = deadline ?? Date.now() + TOTAL_BUDGET_MS;
  const remaining = () => budget - Date.now();

  if (remaining() <= 0) {
    throw new Error(
      `ROMM request budget exhausted after ${TOTAL_BUDGET_MS}ms: ${endpoint}`,
    );
  }

  const maxRetries = 3;
  const attemptTimeout = Math.min(REQUEST_TIMEOUT_MS, remaining());

  let headers = {
    accept: "application/json",
    ...options.headers,
  };

  // Note: `cookies` is accepted for call-site compatibility but deliberately
  // not forwarded. Callers pass GGR's own `session=<JWT>` cookie, which ROMM
  // cannot consume — sending it achieved nothing and leaked a GGR session
  // token to a third-party service.

  // Renewed proactively — a token inside the refresh margin is treated as
  // already gone, rather than waiting for RomM to reject it.
  const token = await getSessionToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions = { ...options, headers };
  const url = `${ROMM_SERVER_URL}/api${endpoint}`;

  /** Wait for the backoff, but never past the overall deadline. */
  const backoff = async () => {
    const wait = Math.min(1000 * Math.pow(2, retryCount), remaining());
    if (wait <= 0) return false;
    await delay(wait);
    return remaining() > 0;
  };

  try {
    let response = await fetchWithTimeout(url, fetchOptions, attemptTimeout);

    // Stale credential: re-authenticate once and replay. The replayed response
    // replaces the original so error reporting below describes the attempt that
    // actually failed.
    //
    // 5xx is included deliberately. RomM answers a request bearing an expired
    // JWT with 500, not 401, so restricting this to 401 meant the dead token
    // was never discarded and the worker stayed poisoned for its whole
    // lifetime. One re-authentication is cheap; if the replay fails the same
    // way it is a real outage and the retry loop below takes over.
    const authSuspect =
      response.status === 401 ||
      response.status === 403 ||
      response.status >= 500;

    if (authSuspect && !reauthorized && canRenewCredential()) {
      reauthorized = true;

      try {
        const refreshed = await getSessionToken(true);

        if (refreshed && remaining() > 0) {
          headers["Authorization"] = `Bearer ${refreshed}`;
          response = await fetchWithTimeout(
            url,
            { ...fetchOptions, headers },
            Math.min(REQUEST_TIMEOUT_MS, remaining()),
          );
        }
      } catch (authError) {
        // If /api/token is down too this is an outage, not a stale token. Keep
        // the original response and let the retry loop below handle it, rather
        // than replacing a transient 500 with an authentication error and
        // skipping the retries that would have ridden it out.
        console.warn(
          `ROMM re-authentication after HTTP ${response.status} failed: ${
            authError?.message || authError
          }`,
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");

      // Retry on 5xx only; 4xx will not resolve itself.
      if (
        response.status >= 500 &&
        retryCount < maxRetries &&
        (await backoff())
      ) {
        console.warn(
          `ROMM API error (attempt ${retryCount + 1}/${maxRetries}): ${response.status} ${url}`,
        );
        return rommRequest(
          endpoint,
          options,
          cookies,
          retryCount + 1,
          budget,
          reauthorized,
        );
      }

      console.error(
        `ROMM API error: ${response.status} ${response.statusText} - ${errorText} (${url})`,
      );
      const error = new Error(
        `ROMM API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
      // Callers need the status to tell a permission problem (403) apart from
      // a missing endpoint (404) or an outage.
      error.status = response.status;
      error.endpoint = endpoint;
      throw error;
    }

    return await response.json();
  } catch (error) {
    // Retry only genuine timeout/network failures. Note AbortSignal.timeout()
    // rejects with a TimeoutError, not an AbortError — the previous check for
    // "AbortError" never matched, so this path relied on a substring test
    // against the message.
    if (
      isTimeoutOrNetworkError(error) &&
      retryCount < maxRetries &&
      (await backoff())
    ) {
      console.warn(
        `ROMM request ${error.name} (attempt ${retryCount + 1}/${maxRetries}): ${url}`,
      );
      return rommRequest(
        endpoint,
        options,
        cookies,
        retryCount + 1,
        budget,
        reauthorized,
      );
    }
    throw error;
  }
}

/**
 * Get recently added ROMs from ROMM library
 * @param {number} limit - Number of ROMs to return
 * @param {number} offset - Offset for pagination
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<Array>} - Array of recently added ROMs
 */
export async function getRecentlyAddedROMs(
  limit = 16,
  offset = 0,
  cookies = null,
) {
  if (browser) throw new Error("getRecentlyAddedROMs is server-only");
  try {
    // Use ROMM API query format with group_by_meta_id=false
    // Add timestamp to ensure fresh data and prevent caching issues
    const timestamp = Date.now();
    const data = await rommRequest(
      `/roms?group_by_meta_id=false&order_by=created_at&order_dir=desc&limit=${limit}&offset=${offset}&_t=${timestamp}`,
      {},
      cookies,
    );

    if (!Array.isArray(data?.items)) {
      // A 200 with an unexpected body is a contract change, not an empty
      // library. Say so rather than rendering "no games".
      throw new Error(
        `ROMM returned an unexpected response shape for /roms (expected { items, total }, got keys: ${Object.keys(data || {}).join(", ") || "none"})`,
      );
    }

    // Use batched formatting to reduce IGDB API calls and respect rate limits
    return await batchFormatROMData(data.items);
  } catch (error) {
    // Deliberately rethrown. Returning [] here made "ROMM is broken"
    // indistinguishable from "the library is empty", which is why the library
    // could disappear with no error anywhere in the UI or the logs.
    console.error(
      `Failed to get recently added ROMs (${error?.status ? `HTTP ${error.status}` : error?.name || "error"}):`,
      error?.message || error,
    );
    throw error;
  }
}

/**
 * Get ROM details by ID
 * @param {string} id - ROM ID
 * @returns {Promise<Object|null>} - ROM details
 */
export async function getROMById(id) {
  if (browser) throw new Error("getROMById is server-only");
  try {
    const data = await rommRequest(`/roms/${id}`);
    return await formatROMData(data);
  } catch (error) {
    console.error(`Failed to get ROM ${id}:`, error);
    return null;
  }
}

/**
 * Search ROMs in ROMM library
 * @param {string} query - Search query
 * @param {number} limit - Number of results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} - Array of matching ROMs
 */
export async function searchROMs(query, limit = 20, offset = 0) {
  if (browser) throw new Error("searchROMs is server-only");
  try {
    const data = await rommRequest(
      `/roms?group_by_meta_id=false&search_term=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    );

    if (!data.items) return [];

    // Use batched formatting to reduce IGDB API calls and respect rate limits
    return await batchFormatROMData(data.items);
  } catch (error) {
    console.error("Failed to search ROMs:", error);
    return [];
  }
}

/**
 * Get all platforms from ROMM
 * @returns {Promise<Array>} - Array of platforms
 */
export async function getPlatforms() {
  if (browser) throw new Error("getPlatforms is server-only");
  try {
    const data = await rommRequest("/platforms");
    return data || [];
  } catch (error) {
    console.error("Failed to get platforms:", error);
    return [];
  }
}

/**
 * Check if ROMM is properly configured
 * @returns {boolean} - Whether ROMM configuration is complete
 */
export async function isRommConfigured() {
  if (browser) throw new Error("isRommConfigured is server-only");

  await loadEnvironmentVariables();
  // Either credential style is sufficient: a Client API Token (preferred), or
  // a username/password pair for the legacy password grant.
  return !!(
    ROMM_SERVER_URL &&
    (ROMM_API_TOKEN || (ROMM_USERNAME && ROMM_PASSWORD))
  );
}

/**
 * Last known ROMM reachability, refreshed in the background.
 *
 * `checkedAt === 0` means we have never probed. Callers on a render path read
 * this snapshot synchronously and never wait for the network.
 */
const availabilityState = {
  ok: null,
  status: null,
  reason: null,
  checkedAt: 0,
  inFlight: null,
};

const AVAILABILITY_TTL_MS = 5 * 60 * 1000;

/**
 * Probe ROMM and record the result. Never throws.
 * @returns {Promise<Object>} - The refreshed snapshot
 */
async function refreshRommAvailability() {
  if (availabilityState.inFlight) return availabilityState.inFlight;

  availabilityState.inFlight = (async () => {
    try {
      if (!(await isRommConfigured())) {
        Object.assign(availabilityState, {
          ok: false,
          status: null,
          reason: "not_configured",
        });
        return availabilityState;
      }

      await rommRequest("/roms?group_by_meta_id=false&limit=1&offset=0");
      Object.assign(availabilityState, {
        ok: true,
        status: 200,
        reason: null,
      });
    } catch (error) {
      const status = error?.status ?? null;
      const reason = status
        ? `http_${status}`
        : isTimeoutOrNetworkError(error)
          ? "unreachable"
          : "error";

      // Log it. A silent `return false` here is why the library could vanish
      // with nothing in the logs to explain it.
      console.warn(
        `⚠️ ROMM availability probe failed (${reason}): ${error?.message || error}`,
      );
      Object.assign(availabilityState, { ok: false, status, reason });
    } finally {
      availabilityState.checkedAt = Date.now();
      availabilityState.inFlight = null;
    }

    return availabilityState;
  })();

  return availabilityState.inFlight;
}

/**
 * Read ROMM availability without ever touching the network.
 *
 * Returns the last known result and triggers a background refresh when stale.
 * This is what render paths must use — awaiting a live probe in the root layout
 * is what previously blocked every page render, including `/login`.
 *
 * @returns {Object} - `{ ok, status, reason, checkedAt, stale }`
 */
export function getRommAvailabilitySnapshot() {
  if (browser) throw new Error("getRommAvailabilitySnapshot is server-only");

  const age = Date.now() - availabilityState.checkedAt;
  const stale = availabilityState.checkedAt === 0 || age > AVAILABILITY_TTL_MS;

  if (stale) {
    // Fire and forget — the caller gets the previous value immediately.
    refreshRommAvailability().catch(() => {});
  }

  return {
    ok: availabilityState.ok,
    status: availabilityState.status,
    reason: availabilityState.reason,
    checkedAt: availabilityState.checkedAt,
    stale,
  };
}

/**
 * Force a fresh availability probe. For admin "test connection" flows and
 * startup warm-up — never for a render path.
 * @returns {Promise<Object>} - Fresh snapshot
 */
export async function probeRommAvailability() {
  if (browser) throw new Error("probeRommAvailability is server-only");
  availabilityState.checkedAt = 0;
  const state = await refreshRommAvailability();
  return { ...state, inFlight: undefined };
}

/**
 * Check if ROMM is available and accessible
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<boolean>} - Whether ROMM is available
 */
export async function isRommAvailable(cookies = null) {
  if (browser) throw new Error("isRommAvailable is server-only");
  if (!(await isRommConfigured())) {
    return false;
  }

  try {
    // Try a simple endpoint to test connectivity
    await rommRequest(
      "/roms?group_by_meta_id=false&limit=1&offset=0",
      {},
      cookies,
    );
    return true;
  } catch (error) {
    // Always log. Returning a bare `false` here made a 403, a DNS failure, a
    // timeout, and an empty library indistinguishable from one another.
    console.warn(
      `⚠️ ROMM unavailable (${error?.status ? `HTTP ${error.status}` : error?.name || "error"}): ${error?.message || error}`,
    );
    return false;
  }
}

/**
 * Turn a ROMM failure into something that can be shown to a user and acted on
 * by an administrator.
 *
 * @param {Error} error - Error thrown by a ROMM call
 * @returns {{reason: string, status: number|null, message: string, hint: string|null}}
 */
export function describeRommError(error) {
  const status = error?.status ?? null;

  if (status === 401) {
    return {
      reason: "unauthorized",
      status,
      message: "ROMM rejected the credentials.",
      hint: "Check ROMM_API_TOKEN, or ROMM_USERNAME / ROMM_PASSWORD.",
    };
  }

  if (status === 403) {
    return {
      reason: "forbidden",
      status,
      message:
        "ROMM accepted the credentials but denied access to the library.",
      // This is the RomM 5.0 failure mode: login succeeds, scopes are empty.
      hint: "The ROMM account is missing the 'roms.read' scope. In the ROMM admin UI grant its group library read access, or issue a Client API Token with roms.read and set ROMM_API_TOKEN.",
    };
  }

  if (status === 404) {
    return {
      reason: "not_found",
      status,
      message: "The ROMM API endpoint was not found.",
      hint: "Check ROMM_SERVER_URL, and whether this ROMM version still exposes /api/roms.",
    };
  }

  if (status && status >= 500) {
    return {
      reason: "server_error",
      status,
      message: `ROMM returned a server error (${status}).`,
      hint: "Check the ROMM server logs.",
    };
  }

  if (isTimeoutOrNetworkError(error)) {
    return {
      reason: "unreachable",
      status,
      message: "Could not reach the ROMM server.",
      hint: "Check ROMM_SERVER_URL and that ROMM is reachable from this container. An internal hostname is faster and more reliable than a public URL.",
    };
  }

  return {
    reason: "error",
    status,
    message: error?.message || "Unknown ROMM error.",
    hint: null,
  };
}

/**
 * Add delay between requests to avoid rate limiting
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format multiple ROM data with batched IGDB lookups to avoid rate limiting
 * @param {Array} roms - Array of ROM data from ROMM API
 * @returns {Promise<Array>} - Array of formatted game data
 */
async function batchFormatROMData(roms) {
  if (!roms || roms.length === 0) return [];

  const results = [];

  // Process ROMs in smaller batches to avoid overwhelming IGDB API
  const batchSize = 3; // Reduced batch size to be more conservative

  for (let i = 0; i < roms.length; i += batchSize) {
    const batch = roms.slice(i, i + batchSize);

    // Process each ROM in the batch
    const batchPromises = batch.map(async (rom) => {
      if (!rom) return null;

      // Public base: this URL is rendered as an <img src> in the browser.
      // ROMM covers are not routed through /api/images/proxy — that only
      // rewrites igdb.com URLs — so the browser fetches this directly.
      let cover_url = rom.url_cover
        ? `${ROMM_SERVER_URL_PUBLIC}${rom.url_cover}`
        : null;

      // Try to get IGDB cover if IGDB ID is available
      if (rom.igdb_id) {
        try {
          const igdbGame = await getGameById(rom.igdb_id);
          if (igdbGame?.cover_url) {
            cover_url = igdbGame.cover_url;
          }
        } catch (error) {
          // Fall back to ROMM cover if IGDB lookup fails (rate limit or other error)
          // Don't log warnings for rate limit errors to reduce noise
          if (!error.message?.includes("Too Many Requests")) {
            console.warn(
              `Failed to get IGDB data for ROM ${rom.id}:`,
              error.message,
            );
          }
        }
      }

      // Field mapping follows RomM's RomSchema. Several of these were
      // previously read from properties RomM has never returned — there is no
      // nested `rom.platform` object, and genres/release date/rating live
      // under `metadatum`, not at the top level. Those fields silently came
      // back empty. Fallbacks to the old names are kept so an older RomM (or a
      // fork) still works.
      const meta = rom.metadatum || {};
      const platformName =
        rom.platform_custom_name ||
        rom.platform_display_name ||
        rom.platform_name ||
        rom.platform?.name ||
        null;
      const rating = meta.average_rating ?? rom.rating ?? null;

      return {
        id: rom.id,
        igdb_id: rom.igdb_id?.toString() || rom.id.toString(),
        title: rom.name || rom.fs_name_no_tags || "Unknown Game",
        summary: rom.summary || "",
        cover_url,
        platforms: platformName ? [platformName] : [],
        genres: meta.genres || rom.genres || [],
        rating,
        release_date: meta.first_release_date ?? rom.first_release_date ?? null,
        popularity_score: rating || 0,
        status: "available", // All ROMM games are available to play
        romm_id: rom.id,
        romm_url: `${ROMM_SERVER_URL_PUBLIC}/rom/${rom.id}`,
        platform_id: rom.platform_id ?? rom.platform?.id,
        platform_name: platformName,
        platform_slug: rom.platform_slug || null,
        created_at: rom.created_at,
        updated_at: rom.updated_at,
        file_name: rom.fs_name || rom.file_name,
        file_size: rom.fs_size_bytes ?? rom.file_size,
        // Flag to identify this as a ROMM game
        is_romm_game: true,
      };
    });

    // Wait for the batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((result) => result !== null));

    // Add delay between batches to respect rate limits
    if (i + batchSize < roms.length) {
      await delay(200); // 200ms delay between batches
    }
  }

  return results;
}

/**
 * Format single ROM data (legacy function for compatibility)
 * @param {Object} rom - Raw ROM data from ROMM API
 * @returns {Promise<Object>} - Formatted game data
 */
async function formatROMData(rom) {
  if (!rom) return null;
  const results = await batchFormatROMData([rom]);
  return results[0] || null;
}

/**
 * Cross-reference IGDB games with ROMM library to check availability
 * @param {Array} igdbGames - Array of IGDB games
 * @param {string} cookies - Optional cookies to forward
 * @returns {Promise<Array>} - IGDB games with ROMM availability flags
 */
export async function crossReferenceWithROMM(igdbGames, cookies = null) {
  if (browser) throw new Error("crossReferenceWithROMM is server-only");
  if (!(await isRommConfigured()) || !(await isRommAvailable(cookies))) {
    return igdbGames;
  }

  try {
    // Get ROMs ordered by creation date (prioritize recently added)
    const allROMs = await rommRequest(
      "/roms?group_by_meta_id=false&order_by=created_at&order_dir=desc&limit=2000&offset=0",
      {},
      cookies,
    );
    const rommLookup = new Map();

    if (allROMs.items) {
      allROMs.items.forEach((rom) => {
        if (rom.igdb_id) {
          rommLookup.set(rom.igdb_id.toString(), rom);
        }
        // Also try matching by name (fuzzy matching)
        if (rom.name) {
          rommLookup.set(rom.name.toLowerCase().trim(), rom);
        }
      });
    }

    return igdbGames.map((game) => {
      const rommGame =
        rommLookup.get(game.igdb_id) ||
        rommLookup.get(game.title?.toLowerCase()?.trim());

      if (rommGame) {
        return {
          ...game,
          is_in_romm: true,
          romm_id: rommGame.id,
          romm_url: `${ROMM_SERVER_URL_PUBLIC}/rom/${rommGame.id}`,
          platform_name: rommGame.platform?.name,
        };
      }

      return {
        ...game,
        is_in_romm: false,
      };
    });
  } catch (error) {
    console.error("Failed to cross-reference with ROMM:", error);
    return igdbGames;
  }
}
