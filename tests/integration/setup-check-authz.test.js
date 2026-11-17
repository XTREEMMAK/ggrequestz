/**
 * Regression tests for the public setup check (GHSA-rrjq-wcr3-vjqf).
 *
 * POST /api/setup/check stayed public after setup, so anyone could make the
 * server sign in to RomM with its configured credential, mint IGDB tokens, and
 * read database and Redis error text. Verified live against the test stack
 * before the fix: anonymous database, Redis and RomM checks all returned 200.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let setup;

const needsInitialSetup = vi.fn(async () => {
  if (setup === "unknown") throw new Error("connection refused");
  return setup === "open";
});
const query = vi.fn(async () => ({ rows: [{ test: 1 }] }));

vi.mock("$lib/basicAuth.js", () => ({ needsInitialSetup }));
vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/cache.js", () => ({ getRedisClient: () => null }));
vi.mock("$lib/library/config.js", () => ({
  resolveLibraryConfig: () => ({
    url: "http://romm.internal.test",
    apiToken: "rmm_server_token",
  }),
}));

async function check(service) {
  const { POST } = await import("../../src/routes/api/setup/check/+server.js");
  const request = new Request("http://localhost/api/setup/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service }),
  });
  const response = await POST({ request });
  return response.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.IGDB_CLIENT_ID = "client";
  process.env.IGDB_CLIENT_SECRET = "secret";
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ access_token: "t" }), { status: 200 }),
  );
});

describe("POST /api/setup/check", () => {
  it.each(["database_connection", "redis_cache", "igdb_api", "romm_library"])(
    "refuses %s for anyone once setup is complete, and does nothing",
    async (service) => {
      setup = "closed";
      expect(await check(service)).toBe(403);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["igdb_api", "romm_library"])(
    "refuses the credentialed %s check while the database cannot say whether setup is done",
    async (service) => {
      setup = "unknown";
      expect(await check(service)).toBe(503);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("still runs the database check while the database cannot answer, to diagnose it", async () => {
    setup = "unknown";
    expect(await check("database_connection")).toBe(200);
    expect(query).toHaveBeenCalled();
  });

  it.each(["igdb_api", "romm_library"])(
    "runs %s during first-run setup, with a deadline on every call",
    async (service) => {
      setup = "open";
      expect(await check(service)).toBe(200);
      expect(global.fetch).toHaveBeenCalled();
      for (const [, options] of global.fetch.mock.calls) {
        expect(options.signal).toBeInstanceOf(AbortSignal);
      }
    },
  );
});
