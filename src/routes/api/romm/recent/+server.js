/**
 * API endpoint for paginated ROMM recent games
 */

import { json } from "@sveltejs/kit";
import {
  getRecentlyAddedROMs,
  isRommConfigured,
  describeRommError,
} from "$lib/romm.server.js";

export async function GET({ url, request }) {
  const searchParams = url.searchParams;
  const page = parseInt(searchParams.get("page")) || 1;
  const limit = parseInt(searchParams.get("limit")) || 12;

  // Forward cookies from the client request
  const cookies = request.headers.get("cookie");

  if (!(await isRommConfigured())) {
    return json(
      {
        success: false,
        reason: "not_configured",
        error: "ROMM is not configured on this server.",
        games: [],
      },
      { status: 503 },
    );
  }

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  try {
    // No separate availability probe here: the list call itself is the probe,
    // and doing both doubled the round trips on every "load more".
    const games = await getRecentlyAddedROMs(limit, offset, cookies);

    return json({
      success: true,
      games,
      page,
      limit,
      hasMore: games.length === limit,
    });
  } catch (err) {
    // Report the real failure with a real status code. This previously
    // returned HTTP 200 with `success: false`, so callers treated a broken
    // ROMM as an empty library.
    const details = describeRommError(err);
    console.error(
      `ROMM recent API error (${details.reason}${details.status ? ` / ${details.status}` : ""}): ${details.message}`,
    );

    return json(
      {
        success: false,
        reason: details.reason,
        status: details.status,
        error: details.message,
        hint: details.hint,
        games: [],
      },
      // 502: this endpoint is fine, the upstream it depends on is not.
      { status: 502 },
    );
  }
}
