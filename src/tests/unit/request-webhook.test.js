/**
 * Regression tests for the outbound request webhook.
 *
 * The webhook was documented and configurable, but nothing dispatched it on a
 * new request: the only builder for the `game_request` payload lived in
 * `$lib/webhooks.js` and posted to the relative URL "/api/webhooks", which
 * resolves in a browser and nowhere else. No module imported it. A submitted
 * request therefore notified Gotify and no receiver ever heard about it.
 *
 * These tests pin the payload contract a receiver depends on, and the
 * resolution order between REQUEST_WEBHOOK_URL and its deprecated alias.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_KEYS = ["REQUEST_WEBHOOK_URL", "N8N_WEBHOOK_URL"];

/** A row as `INSERT ... RETURNING *` hands it back: UUID id, JSONB platforms. */
function requestRow(overrides = {}) {
  return {
    id: "eac1cd44-5f6e-4f49-8ac1-9936066105a6",
    user_id: "12",
    user_name: "alice",
    request_type: "game",
    title: "Chrono Trigger",
    igdb_id: "1234",
    platforms: ["Super Nintendo"],
    priority: "medium",
    description: "",
    reason: "",
    status: "pending",
    ...overrides,
  };
}

function okResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ received: true }),
  };
}

/** The JSON body of the single dispatch that was made. */
function dispatchedPayload() {
  expect(global.fetch).toHaveBeenCalledTimes(1);
  return JSON.parse(global.fetch.mock.calls[0][1].body);
}

/** Import a pristine copy, so nothing caches a URL across tests. */
async function freshWebhooks() {
  vi.resetModules();
  return import("$lib/webhooks.server.js");
}

describe("outbound request webhook", () => {
  beforeEach(() => {
    for (const key of URL_KEYS) {
      delete process.env[key];
    }
    global.fetch = vi.fn(async () => okResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("$env/dynamic/private");
  });

  describe("URL resolution", () => {
    it("dispatches nothing when neither variable is set", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await expect(sendGameRequestWebhook(requestRow())).resolves.toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("honours the deprecated N8N_WEBHOOK_URL alone, so existing installs keep working", async () => {
      process.env.N8N_WEBHOOK_URL = "http://legacy.test/hook";
      const { sendGameRequestWebhook } = await freshWebhooks();

      await expect(sendGameRequestWebhook(requestRow())).resolves.toBe(true);
      expect(global.fetch.mock.calls[0][0]).toBe("http://legacy.test/hook");
    });

    it("uses REQUEST_WEBHOOK_URL when set alone", async () => {
      process.env.REQUEST_WEBHOOK_URL = "http://current.test/hook";
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow());
      expect(global.fetch.mock.calls[0][0]).toBe("http://current.test/hook");
    });

    it("prefers REQUEST_WEBHOOK_URL when both are set", async () => {
      process.env.REQUEST_WEBHOOK_URL = "http://current.test/hook";
      process.env.N8N_WEBHOOK_URL = "http://legacy.test/hook";
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow());
      expect(global.fetch.mock.calls[0][0]).toBe("http://current.test/hook");
    });

    it("prefers the runtime env over process.env for the same name", async () => {
      // A container gets its configuration at start, not at build: the value
      // SvelteKit resolves at runtime has to win over whatever was baked in.
      process.env.REQUEST_WEBHOOK_URL = "http://build.test/hook";
      vi.resetModules();
      vi.doMock("$env/dynamic/private", () => ({
        env: { REQUEST_WEBHOOK_URL: "http://runtime.test/hook" },
      }));
      const { sendGameRequestWebhook } = await import(
        "$lib/webhooks.server.js"
      );

      await sendGameRequestWebhook(requestRow());
      expect(global.fetch.mock.calls[0][0]).toBe("http://runtime.test/hook");
    });
  });

  describe("payload", () => {
    beforeEach(() => {
      process.env.REQUEST_WEBHOOK_URL = "http://receiver.test/hook";
    });

    it("sends the documented shape as JSON", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow());

      const [, init] = global.fetch.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");

      const payload = dispatchedPayload();
      expect(payload.type).toBe("game_request");
      expect(payload.title).toBe("New Game Request: Chrono Trigger");
      expect(payload.message).toContain("Chrono Trigger");
      expect(payload.timestamp).toEqual(expect.any(String));
      expect(payload.data).toMatchObject({
        request_id: "eac1cd44-5f6e-4f49-8ac1-9936066105a6",
        user_id: "12",
        game_title: "Chrono Trigger",
        igdb_id: "1234",
        platforms: ["Super Nintendo"],
        request_type: "game",
      });
    });

    it("keeps platforms an array, which is what a receiver matches on", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(
        requestRow({ platforms: ["Super Nintendo", "Game Boy"] }),
      );

      expect(dispatchedPayload().data.platforms).toEqual([
        "Super Nintendo",
        "Game Boy",
      ]);
    });

    it("sends an empty array, not null, when no platform was given", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow({ platforms: null }));

      expect(dispatchedPayload().data.platforms).toEqual([]);
    });

    it("wraps a bare string platform rather than emitting it as one", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow({ platforms: "Super Nintendo" }));

      expect(dispatchedPayload().data.platforms).toEqual(["Super Nintendo"]);
    });

    it("orders priority so urgent outranks high", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();
      const priorityFor = async (priority) => {
        global.fetch.mockClear();
        await sendGameRequestWebhook(requestRow({ priority }));
        return dispatchedPayload().priority;
      };

      const urgent = await priorityFor("urgent");
      const high = await priorityFor("high");
      const medium = await priorityFor("medium");
      const low = await priorityFor("low");

      expect(urgent).toBeGreaterThan(high);
      expect(high).toBeGreaterThan(medium);
      expect(medium).toBeGreaterThan(low);
      // The documented example pins medium.
      expect(medium).toBe(5);
    });

    it("survives a request with no reason, without writing 'undefined'", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow({ reason: null }));

      expect(dispatchedPayload().message).not.toContain("undefined");
    });
  });

  describe("failure handling", () => {
    beforeEach(() => {
      process.env.REQUEST_WEBHOOK_URL = "http://receiver.test/hook";
    });

    it("reports a rejecting receiver, so the caller can log it", async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }));
      const { sendGameRequestWebhook } = await freshWebhooks();

      await expect(sendGameRequestWebhook(requestRow())).rejects.toThrow("502");
    });

    it("gives the receiver a deadline, so a hung one cannot pin the request open", async () => {
      const { sendGameRequestWebhook } = await freshWebhooks();

      await sendGameRequestWebhook(requestRow());

      expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
    });

    it("treats a non-JSON body from the receiver as success", async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 204,
        statusText: "No Content",
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }));
      const { sendGameRequestWebhook } = await freshWebhooks();

      await expect(sendGameRequestWebhook(requestRow())).resolves.toBe(true);
    });
  });
});
