/**
 * Rules for the public image proxy, /api/images/proxy.
 *
 * The proxy is reachable without signing in, because cover art appears on
 * pages a signed-out visitor can load. That makes every decision here a
 * decision about what an anonymous caller can make this server fetch, and what
 * it can make this origin serve.
 *
 * The previous check was `hostname.includes(domain)`, so a host such as
 * `images.igdb.com.attacker.example` passed, on any port and over plain HTTP.
 * Redirects were followed without re-checking, and the upstream Content-Type
 * was served back as-is. Together that let an anonymous caller reach internal
 * services, and serve HTML or SVG from this origin to a signed-in user who
 * followed a link. Each rule below closes one of those.
 */

/**
 * Exact host names the proxy will fetch from.
 *
 * Only IGDB is used: every URL the app builds for the proxy is an
 * images.igdb.com URL (igdb.js, gameCache.js, GameCard.svelte). The RAWG and
 * Steam hosts that used to be listed had no caller, so they were only surface.
 */
export const PROXY_HOSTS = new Set(["images.igdb.com"]);

/**
 * Response types the proxy will serve.
 *
 * Raster formats only. SVG is deliberately absent: it is a document that can
 * carry script, and serving one from this origin is exactly the problem being
 * fixed.
 */
const RASTER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** Per-hop deadline. Engineering rule 2: no outbound call without one. */
export const PROXY_FETCH_TIMEOUT_MS = 8000;

/** Largest body accepted. IGDB covers and screenshots are well under 1 MB. */
export const PROXY_MAX_BYTES = 5 * 1024 * 1024;

/** Redirect hops followed, each one re-validated. */
export const PROXY_MAX_REDIRECTS = 2;

/** Longest `url` parameter accepted. */
const MAX_URL_LENGTH = 2048;

/**
 * The URL to fetch for a caller-supplied value, or null when it must be
 * refused.
 *
 * Accepts the shapes the app itself produces (https, plus protocol-relative
 * `//images.igdb.com/...` from older cached rows, plus http, which is upgraded),
 * and always fetches over https on the default port. The host must match
 * exactly: no substring, no trailing dot, no credentials, no explicit port.
 *
 * @param {string|null} raw - The `url` query parameter
 * @returns {URL|null}
 */
export function resolveProxyTarget(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (raw.length > MAX_URL_LENGTH) return null;

  let url;
  try {
    // The base only lets a protocol-relative value parse. A relative path
    // resolves onto it, and `.invalid` is never in PROXY_HOSTS, so it cannot
    // turn a path into an allowed target.
    url = new URL(raw, "https://base.invalid");
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  // Default ports normalise to "", so this rejects only an explicit other port.
  if (url.port !== "") return null;
  // URL lowercases the host and converts IDNs to punycode before this check.
  if (!PROXY_HOSTS.has(url.hostname)) return null;

  url.protocol = "https:";
  url.hash = "";
  return url;
}

/**
 * The canonical raster type for a Content-Type header, or null.
 * @param {string|null} header
 * @returns {string|null}
 */
export function rasterType(header) {
  const type = String(header || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return RASTER_TYPES.has(type) ? type : null;
}

/** Discard a body we are not going to read, so the socket is released. */
async function discard(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing useful to do; the response is being dropped either way.
  }
}

/**
 * Read a body, stopping as soon as it passes the size limit.
 * @returns {Promise<Buffer|null>} - The bytes, or null when too large
 */
async function readCapped(response) {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > PROXY_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * Fetch an image from an allowed target.
 *
 * Redirects are followed by hand so that every hop passes resolveProxyTarget;
 * `fetch`'s own redirect handling would follow one to any host. Asking for
 * `identity` encoding keeps remote compressed bodies away from Node's
 * decompressors (CVE-2026-111497 was in the Brotli decoder); already
 * compressed image formats gain nothing from transfer compression.
 *
 * Network failures and timeouts are thrown for the caller to classify.
 *
 * @param {URL} target - A URL returned by resolveProxyTarget
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<{ok: true, contentType: string, data: Buffer} | {ok: false, status: number, reason: string}>}
 */
export async function fetchProxiedImage(target, { fetchImpl = fetch } = {}) {
  let url = target;

  for (let hop = 0; hop <= PROXY_MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(url.href, {
      redirect: "manual",
      headers: {
        "User-Agent": "GGRequestz/1.0 (Image Proxy)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      await discard(response);
      const location = response.headers.get("location");
      const next = location
        ? resolveProxyTarget(new URL(location, url).href)
        : null;
      if (!next) {
        return { ok: false, status: 502, reason: "redirect_refused" };
      }
      url = next;
      continue;
    }

    if (!response.ok) {
      await discard(response);
      // A missing image is a 404 to the browser too, so its onerror fallback
      // runs. Anything else from upstream is a gateway failure.
      return {
        ok: false,
        status: response.status === 404 ? 404 : 502,
        reason: `upstream_${response.status}`,
      };
    }

    const contentType = rasterType(response.headers.get("content-type"));
    if (!contentType) {
      await discard(response);
      return { ok: false, status: 502, reason: "type_refused" };
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > PROXY_MAX_BYTES) {
      await discard(response);
      return { ok: false, status: 502, reason: "too_large" };
    }

    const data = await readCapped(response);
    if (!data) return { ok: false, status: 502, reason: "too_large" };

    return { ok: true, contentType, data };
  }

  return { ok: false, status: 502, reason: "too_many_redirects" };
}
