/**
 * Where the game library is and how to reach it.
 *
 * LIBRARY_* is the documented name. ROMM_* is honoured as a fallback so an
 * existing install upgrades without touching its configuration -- the same
 * trade REQUEST_WEBHOOK_URL made with N8N_WEBHOOK_URL.
 */

import { env } from "$env/dynamic/private";

/** Backends this build knows how to talk to. */
export const LIBRARY_KINDS = Object.freeze(["romm", "gaseous", "retrom"]);

/** How often the index sync runs, when it is enabled at all. */
const DEFAULT_SYNC_INTERVAL_MS = 900000;

/** Entries per upsert statement. */
const DEFAULT_SYNC_BATCH = 500;

/** Runtime env first: a container is configured at start, not at build. */
function read(...names) {
  for (const name of names) {
    const value = env[name] || process.env[name];
    if (value) return value;
  }
  return undefined;
}

/**
 * A positive-integer setting, or the default when it is unset or unusable.
 *
 * Falls back rather than accepting the parse: `Number.parseInt("fifteen")` is
 * NaN and `Number.parseInt("0")` is 0, and neither is a usable interval or
 * batch size -- 0ms is a hot loop and a batch of 0 is a walk that never
 * advances.
 *
 * @param {string} name - Environment variable name
 * @param {number} fallback - Value to use when the variable is unusable
 * @returns {number}
 */
function readPositiveInt(name, fallback) {
  const raw = read(name);
  if (raw === undefined) return fallback;

  const value = Number.parseInt(raw, 10);
  if (Number.isInteger(value) && value > 0) return value;

  console.warn(
    `⚠️ ${name}=${JSON.stringify(raw)} is not a positive integer; using ${fallback}`,
  );
  return fallback;
}

/**
 * Resolve the library configuration.
 *
 * Deliberately no timeout setting here. LIBRARY_CHECK_TIMEOUT_MS was resolved
 * and consumed by nothing: the setup check hardcodes its own 10s, this
 * defaulted to 5s, and the declared ROMM_CHECK_TIMEOUT_MS fallback had never
 * existed anywhere. Wiring it in would have changed a timeout nobody asked to
 * change, so it is gone until something genuinely reads it.
 *
 * @returns {{kind: string, url: string|undefined, publicUrl: string|undefined,
 *   apiToken: string|undefined, username: string|undefined,
 *   password: string|undefined, syncEnabled: boolean,
 *   syncIntervalMs: number, syncBatchSize: number}}
 * @throws {Error} When LIBRARY_KIND names a backend this build does not have
 */
export function resolveLibraryConfig() {
  const kind = (read("LIBRARY_KIND") || "romm").trim().toLowerCase();

  if (!LIBRARY_KINDS.includes(kind)) {
    // Refused rather than defaulted: silently ignoring a typo here means the
    // operator believes they are talking to Gaseous and are not.
    throw new Error(
      `unknown LIBRARY_KIND ${JSON.stringify(kind)}; expected one of ${LIBRARY_KINDS.join(", ")}`,
    );
  }

  const url = read("LIBRARY_URL", "ROMM_SERVER_URL");

  return {
    kind,
    url,
    // A split network -- Kubernetes, or any internal service address -- needs a
    // separate URL for the browser. Falls back to the internal one.
    publicUrl: read("LIBRARY_PUBLIC_URL", "ROMM_SERVER_URL_PUBLIC") || url,
    apiToken: read("LIBRARY_API_TOKEN", "ROMM_API_TOKEN"),
    username: read("LIBRARY_USERNAME", "ROMM_USERNAME"),
    password: read("LIBRARY_PASSWORD", "ROMM_PASSWORD"),

    // Off unless asked for. Filling the index walks the entire library on a
    // timer, so an existing install must not start doing that because it
    // upgraded -- every read still has its backend fallback, and the router
    // reports indexBuilding for a backend that has none.
    //
    // Compared against the string, not coerced: any non-empty value is truthy,
    // so LIBRARY_SYNC_ENABLED=false would otherwise enable it.
    syncEnabled: read("LIBRARY_SYNC_ENABLED") === "true",
    syncIntervalMs: readPositiveInt(
      "LIBRARY_SYNC_INTERVAL_MS",
      DEFAULT_SYNC_INTERVAL_MS,
    ),
    syncBatchSize: readPositiveInt("LIBRARY_SYNC_BATCH", DEFAULT_SYNC_BATCH),
  };
}
