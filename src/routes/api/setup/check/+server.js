/**
 * Setup system check API endpoint
 * Tests various system connections and services
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { getRedisClient } from "$lib/cache.js";
import { fetchWithTimeout } from "$lib/utils.js";

// The setup wizard waits on this check, so it cannot block unbounded.
const ROMM_CHECK_TIMEOUT_MS = 10000;

export async function POST({ request }) {
  try {
    const { service } = await request.json();

    let result = { success: false, error: null };

    switch (service) {
      case "database_connection":
        result = await testDatabase();
        break;
      case "redis_cache":
        result = await testRedis();
        break;
      case "igdb_api":
        result = await testIGDB();
        break;
      case "romm_library":
        result = await testROMM();
        break;
      default:
        result = { success: false, error: "Unknown service" };
    }

    return json(result);
  } catch (error) {
    console.error("Setup check error:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

async function testDatabase() {
  try {
    // Test basic connection with a simple query
    const result = await query("SELECT 1 as test");

    if (result.rows && result.rows.length > 0) {
      return { success: true };
    } else {
      return { success: false, error: "Database query returned no results" };
    }
  } catch (error) {
    return {
      success: false,
      error: `Database connection failed: ${error.message}`,
    };
  }
}

async function testRedis() {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      // Redis is optional, so this is not a failure
      return {
        success: true,
        warning: "Redis not configured, using memory cache fallback",
      };
    }

    // Test Redis connection with a ping
    const pingResult = await redis.ping();
    if (pingResult === "PONG") {
      return { success: true };
    } else {
      return { success: false, error: "Redis ping failed" };
    }
  } catch (error) {
    // Redis failure is not critical as we have memory fallback
    return {
      success: true,
      warning: `Redis connection failed: ${error.message}. Using memory cache.`,
    };
  }
}

async function testIGDB() {
  try {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, error: "IGDB API credentials not configured" };
    }

    // Get access token
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    });

    if (!tokenResponse.ok) {
      return { success: false, error: "Failed to authenticate with IGDB API" };
    }

    const tokenData = await tokenResponse.json();

    // Test API access with a simple games query
    const apiResponse = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: "fields id,name; limit 1;",
    });

    if (apiResponse.ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: `IGDB API test failed: ${apiResponse.status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `IGDB API connection failed: ${error.message}`,
    };
  }
}

async function testROMM() {
  const rommUrl = process.env.ROMM_SERVER_URL;
  const rommToken = process.env.ROMM_API_TOKEN;
  const rommUsername = process.env.ROMM_USERNAME;
  const rommPassword = process.env.ROMM_PASSWORD;

  if (!rommUrl) {
    return { success: true, warning: "ROMM not configured (optional)" };
  }

  // A Client API Token is a complete credential on its own — requiring a
  // username and password alongside it reported a working configuration as
  // broken.
  if (!rommToken && !(rommUsername && rommPassword)) {
    return {
      success: false,
      error:
        "ROMM credentials not configured. Set ROMM_API_TOKEN, or ROMM_USERNAME and ROMM_PASSWORD.",
    };
  }

  try {
    // A Client API Token needs no exchange; verify it against the library
    // instead, which is what the app actually calls.
    const response = rommToken
      ? await fetchWithTimeout(
          `${rommUrl}/api/roms?group_by_meta_id=false&limit=1&offset=0` +
            // Skip the char index and filter facets: this only checks
            // that the token works, and both aggregate over the whole
            // library. See romm.server.js for the measurements.
            "&with_char_index=false&with_filter_values=false",
          {
            headers: {
              Authorization: `Bearer ${rommToken}`,
              accept: "application/json",
            },
          },
          ROMM_CHECK_TIMEOUT_MS,
        )
      : await fetchWithTimeout(
          `${rommUrl}/api/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "password",
              username: rommUsername,
              password: rommPassword,
              scope: "roms.read",
            }),
          },
          ROMM_CHECK_TIMEOUT_MS,
        );

    if (response.ok) {
      if (rommToken) return { success: true };

      const data = await response.json();
      if (data.access_token) return { success: true };

      console.error(
        "ROMM setup check: token endpoint returned no access_token",
      );
      return {
        success: false,
        error: "ROMM authentication failed: No access token received",
      };
    }

    if (response.status === 401 || response.status === 403) {
      console.error(
        `ROMM setup check: credentials rejected (${response.status})`,
      );
      return {
        success: false,
        error: `ROMM rejected the credentials (HTTP ${response.status}). Check the token or account, and that it has the roms.read scope.`,
      };
    }

    console.error(`ROMM setup check: HTTP ${response.status} from ${rommUrl}`);
    return {
      success: false,
      error: `ROMM connection failed: HTTP ${response.status}`,
    };
  } catch (error) {
    // Report this as a failure. It used to return success:true with a warning,
    // so an unreachable ROMM looked like a passing check.
    const timedOut = error?.name === "TimeoutError";
    console.error(
      `ROMM setup check failed (${timedOut ? "timeout" : error?.name || "error"}): ${
        error?.message || error
      }`,
    );

    return {
      success: false,
      error: timedOut
        ? `ROMM did not respond within ${ROMM_CHECK_TIMEOUT_MS / 1000}s`
        : `ROMM connection test failed: ${error?.message || error}`,
    };
  }
}
