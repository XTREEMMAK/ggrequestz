/**
 * RomM as a library backend.
 *
 * A translation layer only. The token lifecycle, the retry and deadline
 * logic and the availability breaker all live in romm.server.js and are
 * reached through it -- duplicating any of that per backend is exactly what
 * the seam exists to prevent.
 */

import {
  getPlatforms,
  getROMById,
  probeRommAvailability,
  rommRequest,
} from "$lib/romm.server.js";
import { rommCoverUrl, rommPlatformName } from "./romm-fields.js";
import { CAPABILITIES, LIST_ORDERS, normalizeEntry } from "./types.js";

// Every capability, as a template. Handed out as a copy rather than frozen:
// Object.freeze on a Set freezes its own properties and leaves `add` working,
// so a frozen Set is not actually immutable.
const ALL_CAPABILITIES = Object.values(CAPABILITIES);

/**
 * RomM's rom record, in the seam's vocabulary.
 *
 * @param {Object} rom - Raw rom record from the RomM API
 * @param {string|undefined} publicUrl - Browser-facing base, for the cover
 */
function toEntry(rom, publicUrl) {
  return normalizeEntry({
    id: rom.id,
    name: rom.name || rom.fs_name_no_tags,
    platformName: rommPlatformName(rom),
    igdbId: rom.igdb_id,
    sizeBytes: rom.fs_size_bytes,
    addedAt: rom.created_at,
    // url_cover is a path. LibraryEntry.coverUrl is absolute or null, because
    // it is persisted and then rendered as an <img src>.
    coverUrl: rommCoverUrl(publicUrl, rom.url_cover),
    path: rom.fs_path,
  });
}

/** Map a page of roms, dropping any record too malformed to use. */
function toEntries(items, publicUrl) {
  const entries = [];
  for (const rom of items ?? []) {
    try {
      entries.push(toEntry(rom, publicUrl));
    } catch (error) {
      // One bad record must not cost the whole page.
      console.warn("Skipping unusable ROMM record:", error.message);
    }
  }
  return entries;
}

/**
 * Build the RomM backend.
 *
 * @param {Object} config - As returned by resolveLibraryConfig()
 * @returns {Object} - A GameLibrary
 */
export function createRommLibrary(config) {
  // The browser-facing base. Covers are the reason this backend needs the
  // config at all: RomM returns url_cover as a path, and an entry's coverUrl is
  // persisted and then rendered as an <img src>, so it has to be absolute
  // against an address the browser can reach.
  const publicUrl = config?.publicUrl;

  return {
    kind: () => "romm",

    capabilities: () => new Set(ALL_CAPABILITIES),

    probe: () => probeRommAvailability(),

    listPlatforms: async () => {
      const platforms = await getPlatforms();
      return platforms.map((platform) => ({
        id: String(platform.id),
        name: platform.name,
      }));
    },

    getEntry: async (id) => {
      const rom = await getROMById(id);
      if (!rom) return null;
      try {
        return toEntry(rom, publicUrl);
      } catch (error) {
        // Logged, unlike before: returning a bare null here made a malformed
        // record indistinguishable from a 404, for the identical failure
        // toEntries already warns about.
        console.warn(
          `Skipping unusable ROMM record for id ${id}:`,
          error.message,
        );
        return null;
      }
    },

    listEntries: async ({
      limit = 24,
      offset = 0,
      search = null,
      order = LIST_ORDERS.RECENT,
    } = {}) => {
      const params = new URLSearchParams({
        group_by_meta_id: "false",
        limit: String(limit),
        offset: String(offset),
      });

      if (search) params.set("search_term", search);

      // Ordering is asked for, not inferred from the absence of a search term.
      // LIST_RECENT and SEARCH used to be told apart only by whether `search`
      // was passed, which left a backend no way to say it can do one and not
      // the other. RELEVANCE leaves RomM's own ordering alone, which is what
      // makes a search result relevant.
      if (order === LIST_ORDERS.RECENT) {
        params.set("order_by", "created_at");
        params.set("order_dir", "desc");
      }

      const data = await rommRequest(`/roms?${params}`);
      return toEntries(data?.items, publicUrl);
    },

    // RomM's /roms takes no id-greater-than filter, so this cannot be a keyset
    // walk. Verified against a live 4.9.2 instance rather than assumed: the
    // OpenAPI document for GET /api/roms lists no cursor parameter of any
    // kind, and `id_after`, `after_id`, `id_gt`, `id__gt`, `cursor`, `last_id`
    // and `min_id` each return HTTP 200 with the identical unfiltered first
    // page -- exactly as a parameter name invented for the test does, because
    // FastAPI drops query parameters an endpoint does not declare. There is a
    // real `updated_after` datetime filter, which is an incremental-refresh
    // tool and not a way to page.
    //
    // So the walk stays on limit/offset and is made resumable instead. The
    // offset it has reached is reported to the caller after every page, and a
    // pass that dies partway is handed that offset next time rather than
    // starting again from zero. On a 72,162-rom library one page failing used
    // to cost the entire 85-minute enumeration.
    syncEntries: async ({ batchSize = 500, startOffset = 0, onBatch }) => {
      // A resume point that is not a usable offset is ignored rather than
      // passed through: `offset=-1` is a 422 from RomM and `offset=NaN` is a
      // walk that never starts.
      let offset =
        Number.isInteger(startOffset) && startOffset > 0 ? startOffset : 0;

      for (;;) {
        const params = new URLSearchParams({
          group_by_meta_id: "false",
          order_by: "id",
          // Asked for rather than inherited. RomM's default order_dir is
          // "asc" today, and the walk depends on it: ids ascend, so a rom
          // added mid-walk lands past the end of the walk instead of shifting
          // the pages already taken. Descending, every addition would push the
          // whole library one place along and the walk would re-read a row and
          // skip another.
          order_dir: "asc",
          limit: String(batchSize),
          offset: String(offset),
        });

        const data = await rommRequest(`/roms?${params}`);
        const items = data?.items ?? [];

        // An empty page ends the walk. Trusting `total` instead would loop
        // forever if it disagreed with what the pages actually return.
        if (items.length === 0) return;

        // Advanced by what RomM returned, not by what survived toEntries. A
        // record too malformed to map is still a row RomM counted, so stepping
        // by the mapped count would request it again forever and would report
        // a resume offset short by one for every bad record seen.
        offset += items.length;

        await onBatch(toEntries(items, publicUrl), { nextOffset: offset });

        if (items.length < batchSize) return;
      }
    },
  };
}
