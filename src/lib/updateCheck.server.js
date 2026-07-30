/**
 * Whether a newer release exists on GitHub.
 *
 * Structured after the ROMM availability snapshot in `romm.server.js`, for the same
 * reasons: callers read a background-refreshed value synchronously and never wait
 * on the network, the interval backs off while the check keeps failing, and the
 * failure is logged with its status rather than swallowed.
 *
 * Two rules from ENGINEERING_RULES.md shape this file:
 *
 *   - Nothing here may be awaited on a render path. `getUpdateSnapshot()` never
 *     touches the network; it returns what is known and refreshes in the
 *     background when stale.
 *   - "Fails silently", as issue #12 asks, means silent in the *UI*. It does not
 *     mean invisible to the operator, so every failure logs its status code. A
 *     `catch` that returns null without logging is what made ROMM outages
 *     undiagnosable.
 */

import { browser } from "$app/environment";
import { env } from "$env/dynamic/private";
import packageJson from "../../package.json";
import { fetchWithTimeout, isTimeoutOrNetworkError } from "./utils.js";

const RELEASES_URL =
  "https://api.github.com/repos/XTREEMMAK/ggrequestz/releases/latest";

// A release check is not worth a long wait; it is decoration on the sidebar.
const REQUEST_TIMEOUT_MS = 5000;

// Releases happen on the order of weeks. Checking every six hours is already far
// more often than the answer can change.
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
const CHECK_MAX_TTL_MS = 24 * 60 * 60 * 1000;

const state = {
  latest: null,
  url: null,
  checkedAt: 0,
  inFlight: null,
  consecutiveFailures: 0,
};

/**
 * Whether the operator has opted out.
 *
 * Default is enabled, so the indicator works without configuration, but any
 * deployment that does not want the app phoning out can turn it off — air-gapped
 * installs being the obvious case. Read per call rather than cached at module load,
 * so it behaves the same as the rest of the app's environment handling.
 *
 * `$env/dynamic/private` first with a `process.env` fallback, matching
 * `romm.server.js` and `webhooks.server.js`.
 *
 * @returns {boolean}
 */
export function isUpdateCheckEnabled() {
  const raw = env.UPDATE_CHECK_ENABLED ?? process.env.UPDATE_CHECK_ENABLED;
  if (raw === undefined || raw === "") return true;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

/**
 * How long the current result stays authoritative. Doubles with each consecutive
 * failure so a blocked or rate-limited network is not retried on every interval.
 *
 * @returns {number} - Milliseconds
 */
function checkTtl() {
  const failures = state.consecutiveFailures;
  if (failures <= 0) return CHECK_TTL_MS;

  return Math.min(CHECK_TTL_MS * 2 ** (failures - 1), CHECK_MAX_TTL_MS);
}

/**
 * Compare two semantic versions numerically.
 *
 * String comparison gets this wrong in the case that matters — "1.10.0" < "1.9.0"
 * lexically — and that case arrives on the tenth minor release, not never.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} - Positive when `a` is newer
 */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, "")
      // Discard any prerelease or build suffix; only the numeric core is compared.
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);

  const left = parse(a);
  const right = parse(b);

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Ask GitHub for the latest release and record the result. Never throws.
 * @returns {Promise<Object>} - The refreshed state
 */
async function refreshUpdateCheck() {
  if (state.inFlight) return state.inFlight;

  state.inFlight = (async () => {
    try {
      const response = await fetchWithTimeout(
        RELEASES_URL,
        {
          headers: {
            Accept: "application/vnd.github+json",
            // GitHub asks for this and rate-limits harder without it.
            "User-Agent": `ggrequestz/${packageJson.version}`,
          },
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        // 403 here is almost always the unauthenticated rate limit, which is
        // shared per source IP. Say so rather than reporting a bare failure.
        throw Object.assign(
          new Error(
            response.status === 403
              ? "GitHub rate limit reached for this IP"
              : `GitHub returned HTTP ${response.status}`,
          ),
          { status: response.status },
        );
      }

      const release = await response.json();
      const tag = release?.tag_name;
      if (!tag) {
        throw new Error("GitHub response contained no tag_name");
      }

      state.latest = String(tag).replace(/^v/, "");
      state.url = release?.html_url || null;
      state.consecutiveFailures = 0;
    } catch (error) {
      state.consecutiveFailures += 1;

      const status = error?.status ?? null;
      const kind = status
        ? `HTTP ${status}`
        : isTimeoutOrNetworkError(error)
          ? "unreachable"
          : "error";

      // Logged, not surfaced. The sidebar simply shows no indicator.
      console.warn(
        `⚠️ Update check failed (${kind}): ${error?.message || error} — next check in ${Math.round(
          checkTtl() / 3600000,
        )}h`,
      );
    } finally {
      state.checkedAt = Date.now();
      state.inFlight = null;
    }

    return state;
  })();

  return state.inFlight;
}

/**
 * Read update status without ever touching the network.
 *
 * Triggers a background refresh when the value is stale, and returns immediately
 * with whatever is already known. Safe to call from a request handler.
 *
 * @returns {{enabled: boolean, current: string, latest: string|null, updateAvailable: boolean, url: string|null, checkedAt: number}}
 */
export function getUpdateSnapshot() {
  if (browser) throw new Error("getUpdateSnapshot is server-only");

  const current = packageJson.version;

  if (!isUpdateCheckEnabled()) {
    return {
      enabled: false,
      current,
      latest: null,
      updateAvailable: false,
      url: null,
      checkedAt: 0,
    };
  }

  const stale =
    state.checkedAt === 0 || Date.now() - state.checkedAt > checkTtl();
  if (stale) {
    // Fire and forget — this caller gets the previous value immediately.
    refreshUpdateCheck().catch(() => {});
  }

  return {
    enabled: true,
    current,
    latest: state.latest,
    updateAvailable:
      state.latest !== null && compareVersions(state.latest, current) > 0,
    url: state.url,
    checkedAt: state.checkedAt,
  };
}

/**
 * Force a fresh check, bypassing the interval.
 *
 * For a startup warm-up or an admin "check now" action — never for a render path.
 * Mirrors `probeRommAvailability()` in `romm.server.js`.
 *
 * @returns {Promise<Object>} - Fresh snapshot
 */
export async function probeForUpdates() {
  if (browser) throw new Error("probeForUpdates is server-only");
  if (!isUpdateCheckEnabled()) return getUpdateSnapshot();

  state.checkedAt = 0;
  await refreshUpdateCheck();
  return getUpdateSnapshot();
}
