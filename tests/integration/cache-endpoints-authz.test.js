/**
 * Regression tests for the cache maintenance endpoints (GHSA-rrjq-wcr3-vjqf).
 *
 * POST /api/cache/cleanup and DELETE /api/cache/stats needed nothing but a
 * signed-in session. API keys were limited by scope in hooks.server.js;
 * cookie sessions were not limited at all. Verified live against the test
 * stack before the fix: an ordinary user's cleanup and DELETE returned 200.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ORDINARY = { auth_type: "basic", id: 2, sub: "basic_auth_2" };
const ADMIN = { auth_type: "basic", id: 1, sub: "basic_auth_1" };

let caller;

const getAuthenticatedUser = vi.fn(async () => caller);
const userHasPermission = vi.fn(async (userId) => Number(userId) === 1);
const cleanupStaleCache = vi.fn(async () => 0);
const clearAllCache = vi.fn();

vi.mock("$lib/auth.server.js", () => ({ getAuthenticatedUser }));
vi.mock("$lib/userProfile.js", () => ({ userHasPermission }));
vi.mock("$lib/database.js", () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock("$lib/gameCache.js", () => ({
  cleanupStaleCache,
  getCacheStats: vi.fn(async () => ({})),
}));
vi.mock("$lib/cache.js", () => ({
  getCacheStats: vi.fn(() => ({ size: 0, keys: [] })),
  clearAllCache,
}));

const cookies = { get: () => undefined };

async function statusOf(call) {
  try {
    return (await call()).status;
  } catch (err) {
    return err.status;
  }
}

async function cleanup() {
  const { POST } = await import(
    "../../src/routes/api/cache/cleanup/+server.js"
  );
  const url = new URL("http://localhost/api/cache/cleanup?max_age=1");
  return statusOf(() =>
    POST({ url, request: new Request(url, { method: "POST" }), cookies }),
  );
}

async function stats(method) {
  const handlers = await import("../../src/routes/api/cache/stats/+server.js");
  const request = new Request("http://localhost/api/cache/stats", { method });
  return statusOf(() => handlers[method]({ request, cookies }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cache maintenance endpoints", () => {
  it.each([
    ["a signed-out caller", null, 401],
    ["an ordinary user", ORDINARY, 403],
  ])("refuse %s, and change nothing", async (_label, who, status) => {
    caller = who;
    expect(await cleanup()).toBe(status);
    expect(await stats("DELETE")).toBe(status);
    expect(await stats("GET")).toBe(status);
    expect(cleanupStaleCache).not.toHaveBeenCalled();
    expect(clearAllCache).not.toHaveBeenCalled();
  });

  it("let an administrator clean up and clear", async () => {
    caller = ADMIN;
    expect(await cleanup()).toBe(200);
    expect(await stats("DELETE")).toBe(200);
    expect(cleanupStaleCache).toHaveBeenCalledOnce();
    expect(clearAllCache).toHaveBeenCalledOnce();
  });
});
