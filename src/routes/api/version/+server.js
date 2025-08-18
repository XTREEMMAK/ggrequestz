import { json } from "@sveltejs/kit";
import { version } from "$app/environment";
import packageJson from "../../../../package.json";

export async function GET() {
  const buildTime = new Date().toISOString();

  return json({
    version: packageJson.version || "1.0.0",
    name: packageJson.name || "gg-requestz",
    environment: process.env.NODE_ENV || "development",
    buildTime: process.env.BUILD_TIME || buildTime,
    features: {
      oidc: true,
      basicAuth: true,
      redis: !!process.env.REDIS_URL,
      romm: !!process.env.ROMM_URL,
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
