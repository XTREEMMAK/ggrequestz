/**
 * Regression test for the auto-approve status actually reaching the database.
 *
 * POST /api/request builds the inserted row with:
 *
 *   status: (await mayAutoApprove(localUserId)) ? "approved" : "pending",
 *
 * request-auto-approve.test.js pins mayAutoApprove itself in isolation, and
 * request-duplicate-guard.test.js pins mayAutoApprove to false so its
 * assertions stay about duplicates. Neither drives the real POST handler with
 * mayAutoApprove resolving true, so an inverted ternary or a swapped variable
 * on that line would pass the whole suite. A follow-up task branches an
 * outbound webhook dispatch on precisely this field.
 *
 * This asserts on the parameter array handed to the mocked `query` for the
 * INSERT INTO ggr_game_requests statement -- not on the response body, which
 * does not echo the raw insert parameters -- so it pins what actually reaches
 * the database. Status is the 10th bound parameter ($10, index 9) in the
 * route's INSERT column list:
 *   user_id, user_name, request_type, title, igdb_id,
 *   platforms, priority, description, reason, status
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const STATUS_PARAM_INDEX = 9;

const findOpenDuplicate = vi.fn(async () => null);
const mayAutoApprove = vi.fn(async () => false);

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
    return {
      rows: [{ id: "12", username: "alice", email: "a@example.test" }],
    };
  }
  return { rows: [] };
});

vi.mock("$lib/database.js", () => ({
  query,
  gameCache: { upsert: vi.fn(async () => {}) },
}));
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
// A vi.mock factory replaces the module wholesale: both exports the route
// imports from $lib/requestPolicy.server.js must be present, or the route
// crashes on the missing one.
vi.mock("$lib/requestPolicy.server.js", () => ({
  findOpenDuplicate,
  mayAutoApprove,
}));

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

/** The status bound to the most recent INSERT INTO ggr_game_requests call. */
function insertedStatus() {
  const insertCall = query.mock.calls.find(([sql]) =>
    sql.includes("INSERT INTO ggr_game_requests"),
  );
  expect(insertCall).toBeDefined();
  return insertCall[1][STATUS_PARAM_INDEX];
}

describe("POST /api/request auto-approve status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOpenDuplicate.mockResolvedValue(null);
    mayAutoApprove.mockResolvedValue(false);
  });

  it('inserts status "approved" when mayAutoApprove resolves true', async () => {
    mayAutoApprove.mockResolvedValue(true);

    const response = await submit();

    expect(response.status).toBe(201);
    expect(insertedStatus()).toBe("approved");
  });

  it('inserts status "pending" when mayAutoApprove resolves false', async () => {
    mayAutoApprove.mockResolvedValue(false);

    const response = await submit();

    expect(response.status).toBe(201);
    expect(insertedStatus()).toBe("pending");
  });
});
