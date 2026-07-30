/**
 * Regression tests for LIBRARY_* actually reaching the RomM client.
 *
 * config.js documented LIBRARY_URL and LIBRARY_API_TOKEN and nothing read
 * them: every consumer went to ROMM_* directly, so an operator who followed
 * .env.example got isRommConfigured() === false and a library section that
 * silently disappeared with no error anywhere. These pin both directions of
 * the fallback -- the new names must work, and a ROMM_*-only install must be
 * untouched.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// romm.server.js imports this at module scope for IGDB cover lookups. Nothing
// under test reaches it, but the real module pulls in the database pool.
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

const KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
  "ROMM_SERVER_URL",
  "ROMM_SERVER_URL_PUBLIC",
  "ROMM_API_TOKEN",
  "ROMM_USERNAME",
  "ROMM_PASSWORD",
];

/** A fresh romm.server.js: it caches the resolved configuration in module scope. */
async function rommServer() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("library configuration reaches the RomM client", () => {
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
    global.fetch = vi
      .fn()
      .mockResolvedValue(response(200, { items: [], total: 0 }));
  });

  it("treats a LIBRARY_*-only configuration as configured", async () => {
    // The exact failure: .env.example told operators to set these names, and
    // isRommConfigured() only ever looked at ROMM_*.
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("accepts LIBRARY_USERNAME and LIBRARY_PASSWORD as the credential", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_USERNAME = "user";
    process.env.LIBRARY_PASSWORD = "pass";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("still treats a ROMM_*-only configuration as configured", async () => {
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(true);
  });

  it("is unconfigured when neither naming is present", async () => {
    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(false);
  });

  it("is unconfigured with a url but no credential, under either naming", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    const { isRommConfigured } = await rommServer();

    expect(await isRommConfigured()).toBe(false);
  });

  it("sends library requests to LIBRARY_URL, bearing LIBRARY_API_TOKEN", async () => {
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain("http://library.test:8080/api/roms");
    expect(init.headers.Authorization).toBe("Bearer rmm_library_token");
  });

  it("sends library requests to ROMM_SERVER_URL when LIBRARY_URL is unset", async () => {
    // Zero behaviour change for an existing install is the whole point of the
    // fallback: this is the same assertion as above with the old names.
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toContain("http://romm.test/api/roms");
    expect(init.headers.Authorization).toBe("Bearer rmm_romm_token");
  });

  it("prefers LIBRARY_URL over ROMM_SERVER_URL when both are set", async () => {
    process.env.ROMM_SERVER_URL = "http://romm.test";
    process.env.LIBRARY_URL = "http://library.test:8080";
    process.env.ROMM_API_TOKEN = "rmm_romm_token";

    const { rommRequest } = await rommServer();
    await rommRequest("/roms?limit=1&offset=0");

    expect(String(global.fetch.mock.calls[0][0])).toContain(
      "http://library.test:8080/api/roms",
    );
  });

  it("uses LIBRARY_PUBLIC_URL for the browser-facing link base", async () => {
    // library_url is rendered as an href, so it must come from the public
    // name, not the internal one.
    process.env.LIBRARY_URL = "http://library.internal:8080";
    process.env.LIBRARY_PUBLIC_URL = "https://library.example.com";
    process.env.LIBRARY_API_TOKEN = "rmm_library_token";
    global.fetch = vi.fn().mockResolvedValue(
      response(200, {
        items: [{ id: 7, name: "Chrono Trigger", igdb_id: 1721 }],
        total: 1,
      }),
    );

    const { crossReferenceWithROMM } = await rommServer();
    const [game] = await crossReferenceWithROMM([
      { igdb_id: "1721", title: "Chrono Trigger" },
    ]);

    expect(game.library_url).toBe("https://library.example.com/rom/7");
  });
});
