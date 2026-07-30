/**
 * Regression test for the RomM connection-test endpoint's credential handling.
 *
 * POST /admin/api/settings/test-romm briefly fell back to the server's
 * configured LIBRARY_* / ROMM_* credential for whatever the request body
 * omitted. Since `server_url` is caller-supplied too, a request naming only
 * `server_url` (and optionally `username`) made the app authenticate to a
 * host the caller chose, using the install's own ROMM_PASSWORD -- a secret
 * the admin settings page does not otherwise expose (it shows a different,
 * database-backed value). That also broke the feature's actual purpose: an
 * admin testing a partially-filled form got "connection successful" for
 * credentials they never typed.
 *
 * These pin the fix: all three fields must come from the request body, and a
 * missing one is a 400 with no outbound request at all -- not a fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionToken = vi.fn(async () => ({ sub: "user-sub-1" }));
const userHasPermission = vi.fn(async () => true);
const getBasicAuthUser = vi.fn(() => null);
const query = vi.fn(async (sql) => {
  if (sql.includes("FROM ggr_users WHERE authentik_sub")) {
    return { rows: [{ id: 1 }] };
  }
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/auth.server.js", () => ({ verifySessionToken }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));
vi.mock("$lib/basicAuth.js", () => ({ getBasicAuthUser }));

/** Cookies stub carrying a valid session, the way SvelteKit's does. */
function cookiesWithSession() {
  return {
    get: (name) => (name === "session" ? "valid-session-token" : undefined),
  };
}

/** Call the real handler with an authenticated request. */
async function callEndpoint(body) {
  vi.resetModules();
  const { POST } = await import(
    "../../src/routes/admin/api/settings/test-romm/+server.js"
  );

  const request = new Request("http://localhost/admin/api/settings/test-romm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return POST({ request, cookies: cookiesWithSession() });
}

describe("POST /admin/api/settings/test-romm credential handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifySessionToken.mockResolvedValue({ sub: "user-sub-1" });
    userHasPermission.mockResolvedValue(true);
    query.mockImplementation(async (sql) => {
      if (sql.includes("FROM ggr_users WHERE authentik_sub")) {
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    });

    // A secret the server is configured with. The whole point of this suite
    // is that the endpoint must never reach for it on the caller's behalf.
    process.env.ROMM_SERVER_URL = "http://internal-romm.test";
    process.env.ROMM_USERNAME = "server-configured-user";
    process.env.ROMM_PASSWORD = "server-configured-secret";

    global.fetch = vi.fn();
  });

  afterEach(() => {
    delete process.env.ROMM_SERVER_URL;
    delete process.env.ROMM_USERNAME;
    delete process.env.ROMM_PASSWORD;
    vi.restoreAllMocks();
  });

  it("rejects a body that supplies only server_url, without contacting it", async () => {
    // The exact attack: an attacker-chosen host and no credential at all.
    const response = await callEndpoint({
      server_url: "https://attacker.example",
    });

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a body missing only the password, rather than filling it in", async () => {
    const response = await callEndpoint({
      server_url: "https://attacker.example",
      username: "x",
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never sends the configured password anywhere, even on a fuller body", async () => {
    // Belt-and-suspenders: even if server_url and username happen to be
    // supplied, the configured password must not leak into a request that
    // omitted its own.
    await callEndpoint({
      server_url: "https://attacker.example",
      username: "attacker-supplied-user",
    });

    for (const call of global.fetch.mock.calls) {
      const [, init] = call;
      expect(String(init?.body ?? "")).not.toContain(
        "server-configured-secret",
      );
    }
  });
});
