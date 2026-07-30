import { json } from "@sveltejs/kit";
import { version } from "$app/environment";
import packageJson from "../../../../package.json";
import { getVersionHistory } from "$lib/changelog.server.js";
import { getUpdateSnapshot } from "$lib/updateCheck.server.js";

export async function GET() {
  const buildTime = new Date().toISOString();

  // Neither of these reaches the network on this request. The history is inlined
  // at build time and the update status is a background-refreshed snapshot, so
  // this endpoint stays as cheap as it was when it only read package.json.
  const update = getUpdateSnapshot();

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
      romm: !!process.env.ROMM_SERVER_URL,
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
