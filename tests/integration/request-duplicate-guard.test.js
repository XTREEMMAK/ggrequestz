/**
 * Regression tests for duplicate request rejection.
 *
 * ggr_game_requests carried exactly one index -- the primary key -- so the
 * 23505 handler in the route was unreachable and the same game could be
 * requested without limit. Harmless while nothing dispatched; once a request
 * fires a webhook, every duplicate is a duplicate download.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findOpenDuplicate = vi.fn(async () => null);
const query = vi.fn(async (sql) => {
  if (sql.includes("INSERT INTO ggr_game_requests")) {
    return {
      rows: [
        {
          id: "row-1",
          title: "Chrono Trigger",
          status: "pending",
          request_type: "game",
          priority: "medium",
          user_id: "12",
          user_name: "alice",
          igdb_id: "1234",
          platforms: [],
        },
      ],
    };
  }
  if (sql.includes("FROM ggr_users")) {
    return { rows: [{ id: "12", username: "alice", email: "a@example.test" }] };
  }
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({ query, gameCache: { upsert: vi.fn() } }));
vi.mock("$lib/auth.server.js", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    auth_type: "api_key",
    user_id: "12",
    name: "alice",
  })),
}));
vi.mock("$lib/gotify.js", () => ({
  sendNewRequestNotification: vi.fn(async () => {}),
}));
vi.mock("$lib/cache.js", () => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock("$lib/requestPolicy.server.js", () => ({ findOpenDuplicate }));

async function submit(body = {}) {
  vi.resetModules();
  const { POST } = await import("../../src/routes/api/request/+server.js");
  return POST({
    cookies: {},
    request: new Request("http://localhost/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "game",
        title: "Chrono Trigger",
        igdb_id: "1234",
        ...body,
      }),
    }),
  });
}

describe("duplicate request guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOpenDuplicate.mockResolvedValue(null);
  });

  it("accepts a request when no open duplicate exists", async () => {
    expect((await submit()).status).toBe(201);
  });

  it("rejects with 409 when an open request already covers the game", async () => {
    findOpenDuplicate.mockResolvedValue({
      id: "existing-1",
      status: "pending",
      user_name: "bob",
    });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      existing_request_id: "existing-1",
    });
  });

  it("does not insert when it rejects a duplicate", async () => {
    findOpenDuplicate.mockResolvedValue({
      id: "existing-1",
      status: "approved",
    });

    await submit();

    const inserts = query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO ggr_game_requests"),
    );
    expect(inserts).toHaveLength(0);
  });

  it("asks about the game and type it is actually inserting", async () => {
    await submit({ request_type: "fix", title: "  Chrono Trigger  " });

    expect(findOpenDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ igdbId: "1234", requestType: "fix" }),
    );
  });
});
