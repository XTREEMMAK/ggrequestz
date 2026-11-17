/**
 * Image proxy endpoint for caching external images.
 *
 * Public: cover art appears on pages a signed-out visitor can load. What it
 * may fetch and what it may serve are decided in $lib/server/imageProxy.js;
 * read that file before loosening anything here.
 */

import { error } from "@sveltejs/kit";
import { createHash } from "crypto";
import cache from "$lib/cache.js";
import {
  fetchProxiedImage,
  rasterType,
  resolveProxyTarget,
} from "$lib/server/imageProxy.js";
import { isTimeoutOrNetworkError } from "$lib/utils.js";

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds (for Redis TTL)

/**
 * Headers on every image this endpoint serves.
 *
 * The CSP sandbox is the backstop: even if a non-image ever got through, a
 * browser opening it directly would run no script and get no origin.
 */
const IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=604800, immutable",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
};

function imageResponse(data, contentType, cacheState) {
  return new Response(data, {
    headers: {
      ...IMAGE_HEADERS,
      "Content-Type": contentType,
      "X-Image-Cache": cacheState,
    },
  });
}

export async function GET({ url }) {
  const raw = url.searchParams.get("url");
  if (!raw) {
    throw error(400, "Missing image URL parameter");
  }

  const target = resolveProxyTarget(raw);
  if (!target) {
    throw error(403, "Image URL not allowed");
  }

  // Keyed on the normalised URL, so an http or protocol-relative spelling of
  // the same image shares one entry.
  const cacheKey = `img:${createHash("md5").update(target.href).digest("hex")}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      const imageData = JSON.parse(cached);
      // Re-checked on the way out: an entry written before this endpoint
      // validated types must not be served just because it is cached.
      const contentType = rasterType(imageData.contentType);
      if (contentType) {
        return imageResponse(
          Buffer.from(imageData.data, "base64"),
          contentType,
          "redis-hit",
        );
      }
    }
  } catch (cacheError) {
    console.warn("Image proxy cache read failed:", cacheError.message);
  }

  let result;
  try {
    result = await fetchProxiedImage(target);
  } catch (fetchError) {
    if (isTimeoutOrNetworkError(fetchError)) {
      console.warn(
        `Image proxy ${fetchError.name} fetching ${target.href}: ${fetchError.message}`,
      );
      throw error(504, "Image fetch timed out");
    }
    console.error("Image proxy error:", fetchError);
    throw error(502, "Failed to proxy image");
  }

  if (!result.ok) {
    console.warn(`Image proxy refused ${target.href}: ${result.reason}`);
    throw error(result.status, "Failed to proxy image");
  }

  try {
    await cache.set(
      cacheKey,
      JSON.stringify({
        data: result.data.toString("base64"),
        contentType: result.contentType,
        timestamp: Date.now(),
      }),
      CACHE_TTL,
    );
  } catch (cacheError) {
    console.warn("Image proxy cache write failed:", cacheError.message);
  }

  return imageResponse(result.data, result.contentType, "redis-miss");
}
