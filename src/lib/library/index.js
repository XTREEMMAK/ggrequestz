/**
 * The configured game library.
 *
 * One place decides which backend is in play, so no caller has to know.
 */

import { resolveLibraryConfig } from "./config.js";
import { createGaseousLibrary } from "./gaseous.js";
import { createRommLibrary } from "./romm.js";

let cached = null;

/**
 * The library backend this deployment is configured for.
 *
 * @returns {Object} - A GameLibrary
 * @throws {Error} When LIBRARY_KIND names a backend this build lacks
 */
export function getLibrary() {
  if (cached) return cached;

  const config = resolveLibraryConfig();

  switch (config.kind) {
    case "romm":
      cached = createRommLibrary(config);
      return cached;
    case "gaseous":
      cached = createGaseousLibrary(config);
      return cached;
    default:
      // Reachable only for a kind config.js accepts and this switch does not,
      // which means the two lists have drifted.
      throw new Error(
        `LIBRARY_KIND ${JSON.stringify(config.kind)} is not implemented in this build`,
      );
  }
}

/** Drop the cached backend. Tests and configuration reloads need this. */
export function clearLibraryCache() {
  cached = null;
}
