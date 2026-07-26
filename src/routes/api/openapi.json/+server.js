import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import pkg from "../../../../package.json" assert { type: "json" };
import spec from "$lib/openapi.json" assert { type: "json" };

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  // Determine the base URL - use PUBLIC_SITE_URL if set, otherwise use request origin
  const baseUrl = env.PUBLIC_SITE_URL || url.origin;

  // The spec is maintained as data in src/lib/openapi.json. Only the version
  // and the server URL are dynamic, so they are patched in here.
  //
  // The base is the origin root, NOT `${baseUrl}/api`: admin endpoints live at
  // /admin/api/... rather than under /api, so every path in the document is
  // written as a real URL path and the base must not add a prefix.
  const openApiSpec = {
    ...spec,
    info: {
      ...spec.info,
      version: pkg.version,
    },
    servers: [
      {
        url: baseUrl,
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
  };

  return json(openApiSpec);
}
