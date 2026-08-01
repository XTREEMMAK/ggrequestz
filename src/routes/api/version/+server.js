import { json } from "@sveltejs/kit";
import { version } from "$app/environment";
import packageJson from "../../../../package.json";
import { getVersionHistory } from "$lib/changelog.server.js";
import { getUpdateSnapshot } from "$lib/updateCheck.server.js";
import { resolveLibraryConfig } from "$lib/library/config.js";

export async function GET() {
  const buildTime = new Date().toISOString();

  // Neither of these reaches the network on this request. The history is inlined
  // at build time and the update status is a background-refreshed snapshot, so
  // this endpoint stays as cheap as it was when it only read package.json.
  const update = getUpdateSnapshot();

  // Reported through the resolver so the documented LIBRARY_URL counts, not
  // only ROMM_SERVER_URL. An unknown LIBRARY_KIND throws there; /api/version is
  // a liveness surface and must still answer, and the setup check is where a
  // bad kind gets reported.
  let libraryConfigured = false;
  try {
    libraryConfigured = !!resolveLibraryConfig().url;
  } catch (configError) {
    console.warn(
      "Library configuration is invalid:",
      configError?.message || configError,
    );
  }

  return json({
    version: packageJson.version || "1.0.0",
    name: packageJson.name || "gg-requestz",
    environment: process.env.NODE_ENV || "development",
    buildTime: process.env.BUILD_TIME || buildTime,
    history: getVersionHistory(10),
    update: {
      enabled: update.enabled,
      available: update.updateAvailable,
      latest: update.latest,
      url: update.url,
    },
    features: {
      oidc: true,
      basicAuth: true,
      redis: !!process.env.REDIS_URL,
      // ROMM_URL is not a variable this app has ever read — the correct name is
      // ROMM_SERVER_URL, so this always reported false.
      romm: libraryConfigured,
      typesense: !!process.env.TYPESENSE_URL,
    },
    api: {
      version: "v1",
      endpoints: [
        "/api/games",
        "/api/auth",
        "/api/requests",
        "/api/watchlist",
        "/api/admin",
      ],
    },
  });
}
