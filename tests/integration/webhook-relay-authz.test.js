/**
 * Regression tests for the webhook relay (GHSA-pm7x-8vh4-crv2).
 *
 * POST /api/webhooks checked only that a caller was signed in, then relayed
 * their type, title, message and data to the request webhook and to Gotify.
 * The payload is the shape an approval sends, so any user could trigger
 * download automation for a request nobody approved. Verified live against
 * the test stack before the fix: an ordinary user's POST returned 200.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ORDINARY = { auth_type: "basic", id: 2, sub: "basic_auth_2" };
const ADMIN = { auth_type: "basic", id: 1, sub: "basic_auth_1" };
const ORDINARY_KEY = {
  auth_type: "api_key",
  user_id: 2,
  scopes: ["admin:write"],
};

let caller;

const getAuthenticatedUser = vi.fn(async () => caller);
const userHasPermission = vi.fn(async (userId) => Number(userId) === 1);
const sendRequestWebhook = vi.fn(async () => ({ status: "sent" }));

vi.mock("$lib/auth.server.js", () => ({ getAuthenticatedUser }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));
vi.mock("$lib/database.js", () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock("$lib/webhooks.server.js", () => ({
  requestWebhookUrl: () => "https://hooks.example.test/ggr",
  sendRequestWebhook,
}));

const FORGED = {
  type: "game_request",
  title: "New Game Request: Anything",
  message: "forged",
  data: { request_id: 999, igdb_id: "1" },
};

async function relay() {
  const { POST } = await import("../../src/routes/api/webhooks/+server.js");
  const request = new Request("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(FORGED),
  });
  try {
    const response = await POST({ request, cookies: { get: () => undefined } });
    return response.status;
  } catch (err) {
    return err.status;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOTIFY_URL = "https://gotify.example.test";
  process.env.GOTIFY_TOKEN = "test-token";
  global.fetch = vi.fn(async () => new Response("{}", { status: 200 }));
});

describe("POST /api/webhooks", () => {
  it.each([
    ["a signed-out caller", null, 401],
    ["an ordinary user", ORDINARY, 403],
    ["an ordinary user's API key, even with admin:write", ORDINARY_KEY, 403],
  ])("refuses %s and sends nothing", async (_label, who, status) => {
    caller = who;
    expect(await relay()).toBe(status);
    expect(sendRequestWebhook).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("relays for an administrator, with a deadline on the Gotify call", async () => {
    caller = ADMIN;
    expect(await relay()).toBe(200);
    expect(sendRequestWebhook).toHaveBeenCalledOnce();
    const [, options] = global.fetch.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
