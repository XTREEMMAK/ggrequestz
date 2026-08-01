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

/** Runtime env first: a container is configured at start, not at build. */
function read(...names) {
  for (const name of names) {
    const value = env[name] || process.env[name];
    if (value) return value;
  }
  return undefined;
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
 *   password: string|undefined}}
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
  };
}
