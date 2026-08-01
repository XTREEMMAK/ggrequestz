/**
 * RomM's record shape, read the same way everywhere.
 *
 * Two modules read raw rom records: romm.server.js, which formats them into
 * app-shaped game objects, and library/romm.js, which normalises them into
 * LibraryEntry. They disagreed. The seam took `rom.platform?.name` as its
 * first choice -- a property RomM's RomSchema does not have -- and omitted the
 * two names that were found to work; and it passed `url_cover` through
 * unchanged, where the design specifies an absolute URL. These helpers exist so
 * the two cannot drift apart again.
 *
 * Deliberately import-free: a transport module and a backend module both depend
 * on it, so it must not reach for configuration or a client.
 */

/**
 * The platform name for a rom record.
 *
 * RomM returns no nested `rom.platform` object, so reading that first meant
 * every one of these came back empty. The chain that works against RomSchema
 * is platform_custom_name -> platform_display_name -> platform_name. The
 * nested property is kept last so an older RomM, or a fork that does nest it,
 * still resolves.
 *
 * @param {Object} rom - Raw rom record from the RomM API
 * @returns {string|null}
 */
export function rommPlatformName(rom) {
  return (
    rom?.platform_custom_name ||
    rom?.platform_display_name ||
    rom?.platform_name ||
    rom?.platform?.name ||
    null
  );
}

/**
 * A rom's cover as an absolute URL, or null.
 *
 * RomM returns `url_cover` as a path, not a URL, and it is rendered directly as
 * an <img src>: RomM covers are not routed through /api/images/proxy, which
 * only rewrites igdb.com URLs. So it has to be prefixed with the
 * browser-facing base, never the internal one -- a relative value persisted
 * into the local index would be unrecoverable for a browser on a different
 * network from the app.
 *
 * @param {string|undefined|null} publicBase - Browser-facing library base URL
 * @param {string|undefined|null} urlCover - RomM's url_cover
 * @returns {string|null}
 */
export function rommCoverUrl(publicBase, urlCover) {
  if (!urlCover) return null;
  // Already a URL: prefixing again would produce nonsense.
  if (/^https?:\/\//i.test(urlCover)) return urlCover;
  // Nothing to resolve against, and the contract is "absolute or null".
  if (!publicBase) return null;
  return `${publicBase}${urlCover}`;
}
