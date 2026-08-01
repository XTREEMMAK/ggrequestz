/**
 * The vocabulary every library backend speaks.
 *
 * A backend's whole job is to translate its native API into this shape and
 * declare what it can do. Everything backend-independent -- IGDB enrichment,
 * app-shaped formatting, the availability breaker -- stays outside, so it is
 * written once rather than three times.
 */

/**
 * What a backend can be asked to do.
 *
 * SYNC is mandatory: enumerating the library is the one thing every backend
 * can manage. The rest are optional because they are not universally
 * possible -- Retrom's GetGames takes no limit, offset, ordering or search
 * term, so LIST_RECENT and SEARCH cannot be implemented on it at all.
 */
export const CAPABILITIES = Object.freeze({
  SYNC: "SYNC",
  LIST_RECENT: "LIST_RECENT",
  SEARCH: "SEARCH",
  GET_BY_ID: "GET_BY_ID",
  LIST_PLATFORMS: "LIST_PLATFORMS",
});

/**
 * How listEntries should order its results.
 *
 * RECENT is newest-first and is the default. RELEVANCE means "leave the
 * backend's own ordering alone", which for a search is the backend's ranking
 * and is what makes a search result relevant.
 */
export const LIST_ORDERS = Object.freeze({
  RECENT: "recent",
  RELEVANCE: "relevance",
});

/**
 * Which capability each listEntries mode requires.
 *
 *   listEntries({ order })   with no search term  ->  LIST_RECENT
 *   listEntries({ search })                       ->  SEARCH
 *
 * The two modes used to be distinguished only by whether `search` had been
 * passed, and ordering was inferred from the same fact. A backend that can
 * search but not order, or order but not search, had no way to express that.
 * `order` is an explicit option (see LIST_ORDERS) so both modes are named
 * rather than guessed at.
 *
 * A backend asked for a mode it does not declare MUST throw
 * CapabilityUnsupported, naming its own kind and the capability. It must not
 * simply omit listEntries: a missing method gives the caller
 * `TypeError: library.listEntries is not a function`, which names neither the
 * backend nor what it could not do, and is far harder to diagnose than an
 * error that says exactly which capability was missing.
 *
 * Retrom will declare only SYNC, GET_BY_ID and LIST_PLATFORMS, so it is the
 * first backend that has to answer this. RomM declares everything, so it has
 * no throw path at all.
 */

/**
 * A capability was called on a backend that does not declare it.
 *
 * This is a programming error rather than a runtime condition: callers check
 * capabilities first, so seeing this means the caller is wrong. It carries the
 * backend kind and the capability name so the report is actionable without a
 * stack trace.
 */
export class CapabilityUnsupported extends Error {
  constructor(kind, capability) {
    super(`${kind} does not support ${capability}`);
    this.name = "CapabilityUnsupported";
    this.kind = kind;
    this.capability = capability;
  }
}

/** Absent, rather than the string "undefined" or an empty string. */
function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

/**
 * Normalise one backend record into a LibraryEntry.
 *
 * @param {Object} raw - Backend-shaped record, already field-mapped
 * @returns {{id: string, name: string, platformName: string|null,
 *   igdbId: string|null, sizeBytes: number|null, addedAt: Date|null,
 *   coverUrl: string|null, path: string|null}}
 * @throws {Error} When id or name is missing
 */
export function normalizeEntry(raw) {
  const id = optionalString(raw?.id);
  if (!id) throw new Error("library entry has no id");

  const name = optionalString(raw?.name);
  if (!name) throw new Error("library entry has no name");

  let addedAt = null;
  if (raw.addedAt instanceof Date) {
    addedAt = raw.addedAt;
  } else if (raw.addedAt) {
    const parsed = new Date(raw.addedAt);
    if (!Number.isNaN(parsed.getTime())) addedAt = parsed;
  }

  return {
    id,
    name,
    platformName: optionalString(raw.platformName),
    // Stringified once, here. The code this replaces stringified on insert
    // and not on lookup, so a numeric id from IGDB never matched.
    igdbId: optionalString(raw.igdbId),
    sizeBytes: Number.isFinite(raw.sizeBytes) ? raw.sizeBytes : null,
    addedAt,
    coverUrl: optionalString(raw.coverUrl),
    path: optionalString(raw.path),
  };
}
