/**
 * Regression tests for the dispatch trigger.
 *
 * The rule is that a request dispatches exactly once, when it enters
 * 'approved'. Auto-approved creation and admin approval are two doors into one
 * state, so both go through onRequestApproved -- and re-saving an already
 * approved request must not send it again.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendGameRequestWebhook = vi.fn(async () => true);

const ROW = {
  id: "req-1",
  user_id: "12",
  user_name: "alice",
  title: "Chrono Trigger",
  request_type: "game",
  priority: "medium",
  igdb_id: "1234",
  platforms: [],
  admin_notes: null,
};

let transition = { status: "approved", previous_status: "pending" };
const query = vi.fn(async () => ({ rows: [{ ...ROW, ...transition }] }));

vi.mock("$lib/database.js", () => ({ query }));
vi.mock("$lib/gotify.js", () => ({
  sendRequestStatusNotification: vi.fn(async () => true),
  sendRequestCancelledDeletedNotification: vi.fn(async () => true),
  sendBulkRequestStatusNotification: vi.fn(async () => true),
}));
vi.mock("$lib/cache.js", () => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock("$lib/webhooks.server.js", () => ({ sendGameRequestWebhook }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function apply(to) {
  vi.resetModules();
  const { applyRequestStatusChange } = await import(
    "$lib/requestStatus.server.js"
  );
  const result = await applyRequestStatusChange({ id: "req-1", to });
  await settle();
  return result;
}

describe("dispatch on the approval transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transition = { status: "approved", previous_status: "pending" };
  });

  it("dispatches when a pending request is approved", async () => {
    await apply("approved");
    expect(sendGameRequestWebhook).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when an approved request is re-saved", async () => {
    transition = { status: "approved", previous_status: "approved" };
    await apply("approved");
    expect(sendGameRequestWebhook).not.toHaveBeenCalled();
  });

  it("does not dispatch on rejection", async () => {
    transition = { status: "rejected", previous_status: "pending" };
    await apply("rejected");
    expect(sendGameRequestWebhook).not.toHaveBeenCalled();
  });

  it("dispatches once when a fulfilled request is re-opened", async () => {
    // Spec 7.2.1: demotion re-enters approved and re-dispatches, by design.
    transition = { status: "approved", previous_status: "fulfilled" };
    await apply("approved");
    expect(sendGameRequestWebhook).toHaveBeenCalledTimes(1);
  });

  // The re-dispatch carries the same request_id as the first one, so the
  // sender needs the transition to mark it as a repeat. Passing the status the
  // request left is how it gets that -- without it the payload cannot say
  // "again" and a receiver deduping on request_id drops the re-fetch.

  it("tells the sender which status the request left", async () => {
    transition = { status: "approved", previous_status: "fulfilled" };
    await apply("approved");

    expect(sendGameRequestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ id: "req-1" }),
      { previousStatus: "fulfilled" },
    );
  });

  it("reports a first approval as coming from pending, not from nowhere", async () => {
    transition = { status: "approved", previous_status: "pending" };
    await apply("approved");

    expect(sendGameRequestWebhook.mock.calls[0][1]).toEqual({
      previousStatus: "pending",
    });
  });

  it("does not fail the transition when the receiver rejects", async () => {
    sendGameRequestWebhook.mockRejectedValueOnce(new Error("502"));
    const result = await apply("approved");
    expect(result.changed).toBe(true);
  });
});
