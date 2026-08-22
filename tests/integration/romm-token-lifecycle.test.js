/**
 * Regression tests for the ROMM credential lifecycle.
 *
 * Production symptom: ROMM worked after a restart, then degraded to permanent
 * HTTP 500s until the container was restarted again. The cause was a bearer
 * token cached in module scope with no expiry tracking, discarded only on an
 * exact 401. RomM answers a request carrying an expired JWT with 500, so the
 * dead token was re-sent for the lifetime of the worker.
 *
 * These tests pin the behaviour that fixes it. They talk to a mocked fetch, so
 * no ROMM instance is required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// romm.server.js imports this at module scope for IGDB cover lookups. Nothing
// under test reaches it, but the real module pulls in the database pool.
vi.mock("../../src/lib/gameCache.js", () => ({
  getGameById: vi.fn(async () => null),
}));

const ROMM_URL = "http://romm.test";
const TOKEN_URL = `${ROMM_URL}/api/token`;
// The client opts every /roms call out of ROMM's char-index and filter-value
// aggregates, which it never reads. See romm-query-shape.test.js.
const LIBRARY_PATH =
  "/api/roms?group_by_meta_id=false&limit=1&offset=0" +
  "&with_char_index=false&with_filter_values=false";

// Tests that let the retry loop run to exhaustion wait out the real 1s + 2s +
// 4s backoff, well inside the client's own TOTAL_BUDGET_MS.
const RETRY_BUDGET_TEST_TIMEOUT = 20000;

// LIBRARY_URL wins over ROMM_SERVER_URL in resolveLibraryConfig()'s read()
// order. docker-compose.yml forwards LIBRARY_URL, so a developer with it
// exported would otherwise have every ROMM_SERVER_URL set below silently
// overridden.
const LIBRARY_ENV_KEYS = [
  "LIBRARY_KIND",
  "LIBRARY_URL",
  "LIBRARY_PUBLIC_URL",
  "LIBRARY_API_TOKEN",
  "LIBRARY_USERNAME",
  "LIBRARY_PASSWORD",
];

/** Build a minimal Response-alike for the fetch mock. */
function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A token grant with the given lifetime in seconds. */
function grant(token, expiresIn = 1800) {
  return response(200, { access_token: token, expires_in: expiresIn });
}

/** URLs passed to fetch, in order. */
function calledUrls() {
  return global.fetch.mock.calls.map(([url]) => String(url));
}

/** How many times the token endpoint was hit. */
function authCount() {
  return calledUrls().filter((url) => url === TOKEN_URL).length;
}

/**
 * Import a pristine copy of the module. Its token cache and availability state
 * are module-scoped, so every test needs its own instance.
 */
async function freshRomm() {
  vi.resetModules();
  return import("../../src/lib/romm.server.js");
}

/**
 * These tests drive the client through `getRecentlyAddedROMs`, a real caller:
 * one logical `rommRequest` per call, with no availability state of its own. It
 * resolves to `[]` against `{ items: [] }` and rethrows on failure.
 *
 * `probeRommAvailability` would be the wrong driver here: it single-flights on
 * `availabilityState.inFlight`, so the concurrency test below would collapse to
 * one request and pass without proving anything about the token.
 */
describe("ROMM token lifecycle", () => {
  beforeEach(() => {
    for (const key of LIBRARY_ENV_KEYS) delete process.env[key];
    process.env.ROMM_SERVER_URL = ROMM_URL;
    process.env.ROMM_USERNAME = "tester";
    process.env.ROMM_PASSWORD = "secret";
    delete process.env.ROMM_API_TOKEN;

    global.fetch = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("re-authenticates and replays when RomM answers 500", async () => {
    // The exact production failure: the token has lapsed, and RomM reports it
    // as a server error rather than a 401.
    global.fetch
      .mockResolvedValueOnce(grant("expired-token"))
      .mockResolvedValueOnce(response(500, { detail: "Internal Server Error" }))
      .mockResolvedValueOnce(grant("fresh-token"))
      .mockResolvedValueOnce(response(200, { items: [] }));

    const { getRecentlyAddedROMs } = await freshRomm();

    await expect(getRecentlyAddedROMs(1)).resolves.toEqual([]);
    expect(authCount()).toBe(2);

    // The replay must carry the new credential, not the dead one.
    const replayHeaders = global.fetch.mock.calls[3][1].headers;
    expect(replayHeaders.Authorization).toBe("Bearer fresh-token");
  });

  // Exhausting the retry loop spends the real 1s + 2s + 4s backoff. These run
  // on real timers: faking them around the recursive retry proved less
  // trustworthy than simply waiting, and the wait also proves the total stays
  // inside TOTAL_BUDGET_MS.
  it(
    "spends at most one re-authentication per logical request",
    async () => {
      // RomM is genuinely down: every library call 500s. The retry loop must
      // not re-authenticate on each attempt.
      global.fetch.mockImplementation(async (url) =>
        String(url) === TOKEN_URL
          ? grant("token")
          : response(500, { detail: "Internal Server Error" }),
      );

      const { getRecentlyAddedROMs } = await freshRomm();

      await expect(getRecentlyAddedROMs(1)).rejects.toThrow();
      expect(authCount()).toBe(2); // initial grant + the single re-auth
    },
    RETRY_BUDGET_TEST_TIMEOUT,
  );

  it("reuses a cached token across requests", async () => {
    global.fetch.mockImplementation(async (url) =>
      String(url) === TOKEN_URL ? grant("token") : response(200, { items: [] }),
    );

    const { getRecentlyAddedROMs } = await freshRomm();

    await getRecentlyAddedROMs(1);
    await getRecentlyAddedROMs(1);
    await getRecentlyAddedROMs(1);

    expect(authCount()).toBe(1);
  });

  it("renews the token before it expires rather than after a rejection", async () => {
    vi.useFakeTimers();
    global.fetch.mockImplementation(async (url) =>
      String(url) === TOKEN_URL
        ? grant("token", 120) // two-minute lifetime
        : response(200, { items: [] }),
    );

    const { getRecentlyAddedROMs } = await freshRomm();

    await getRecentlyAddedROMs(1);
    expect(authCount()).toBe(1);

    // Inside the refresh margin but before the stated expiry. The old code
    // would happily send this token and wait for RomM to reject it.
    vi.advanceTimersByTime(90_000);
    await getRecentlyAddedROMs(1);

    expect(authCount()).toBe(2);
    const lastLibraryCall = global.fetch.mock.calls.at(-1);
    expect(lastLibraryCall[1].headers.Authorization).toBe("Bearer token");
  });

  it("shares a single authentication between concurrent requests", async () => {
    let resolveGrant;
    const pendingGrant = new Promise((resolve) => {
      resolveGrant = resolve;
    });

    global.fetch.mockImplementation(async (url) =>
      String(url) === TOKEN_URL ? pendingGrant : response(200, { items: [] }),
    );

    const { getRecentlyAddedROMs } = await freshRomm();

    const all = Promise.all([
      getRecentlyAddedROMs(1),
      getRecentlyAddedROMs(1),
      getRecentlyAddedROMs(1),
    ]);
    resolveGrant(grant("token"));

    await expect(all).resolves.toEqual([[], [], []]);
    expect(authCount()).toBe(1);
  });

  it(
    "does not re-authenticate a Client API Token, which cannot change",
    async () => {
      process.env.ROMM_API_TOKEN = "rmm_static_token";
      delete process.env.ROMM_USERNAME;
      delete process.env.ROMM_PASSWORD;

      global.fetch.mockResolvedValue(response(500, { detail: "boom" }));

      const { getRecentlyAddedROMs } = await freshRomm();

      await expect(getRecentlyAddedROMs(1)).rejects.toThrow();
      expect(authCount()).toBe(0);
      expect(calledUrls().every((url) => url.includes("/api/roms"))).toBe(true);
    },
    RETRY_BUDGET_TEST_TIMEOUT,
  );
});

describe("ROMM availability breaker", () => {
  beforeEach(() => {
    for (const key of LIBRARY_ENV_KEYS) delete process.env[key];
    process.env.ROMM_SERVER_URL = ROMM_URL;
    process.env.ROMM_API_TOKEN = "rmm_static_token";
    delete process.env.ROMM_USERNAME;
    delete process.env.ROMM_PASSWORD;

    global.fetch = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it(
    "fails fast instead of retrying while a failure is still cached",
    async () => {
      global.fetch.mockResolvedValue(response(500, { detail: "boom" }));

      const { probeRommAvailability, getRecentlyAddedROMs } = await freshRomm();

      // One probe opens the breaker, having spent its full retry budget.
      const snapshot = await probeRommAvailability();

      expect(snapshot.ok).toBe(false);
      expect(snapshot.reason).toBe("http_500");

      const callsAfterProbe = global.fetch.mock.calls.length;
      expect(callsAfterProbe).toBeGreaterThan(1); // it did retry

      // Subsequent traffic must not reach the network at all. Before the
      // breaker, every one of these paid the full retry budget again.
      const startedAt = Date.now();
      await expect(getRecentlyAddedROMs(10)).rejects.toMatchObject({
        reason: "circuit_open",
      });

      expect(global.fetch.mock.calls.length).toBe(callsAfterProbe);
      expect(Date.now() - startedAt).toBeLessThan(1000);
    },
    RETRY_BUDGET_TEST_TIMEOUT,
  );

  it("records a clean state when ROMM answers", async () => {
    global.fetch.mockResolvedValue(response(200, { items: [] }));

    const { probeRommAvailability, getRommAvailabilitySnapshot } =
      await freshRomm();

    const snapshot = await probeRommAvailability();
    expect(snapshot.ok).toBe(true);
    expect(getRommAvailabilitySnapshot().ok).toBe(true);
  });
});

describe("ROMM library probe path", () => {
  it("targets the endpoint the availability probe is documented to use", async () => {
    for (const key of LIBRARY_ENV_KEYS) delete process.env[key];
    process.env.ROMM_SERVER_URL = ROMM_URL;
    process.env.ROMM_API_TOKEN = "rmm_static_token";
    global.fetch = vi.fn().mockResolvedValue(response(200, { items: [] }));

    const { probeRommAvailability } = await freshRomm();
    await probeRommAvailability();

    expect(calledUrls()).toContain(`${ROMM_URL}${LIBRARY_PATH}`);
  });
});
