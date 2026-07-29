/**
 * Tests for API key scope resolution.
 *
 * Scopes were recorded on every key and offered in the admin UI, but nothing
 * ever checked them, so a key stamped `games:read` carried its owner's full
 * privileges. These guard the table that fixed it — in particular the
 * default-deny behaviour, which is what makes a route added later closed until
 * someone classifies it.
 */

import { describe, it, expect } from "vitest";
import { resolveRequiredScope } from "$lib/apiScopes.js";
import { verifyScopes } from "$lib/apiKeys.js";

describe("resolveRequiredScope", () => {
  it("separates reading requests from creating them", () => {
    expect(resolveRequiredScope("/api/request", "GET")).toBe("requests:read");
    expect(resolveRequiredScope("/api/request", "POST")).toBe("requests:write");
  });

  it("prefers the longer prefix over a shorter one that also matches", () => {
    // Both /api/request and /api/request/rescind match on a plain startsWith;
    // rescind is a write and must not resolve to the parent's GET rule.
    expect(resolveRequiredScope("/api/request/rescind", "POST")).toBe(
      "requests:write",
    );
  });

  it("does not match a path that merely shares a prefix string", () => {
    expect(resolveRequiredScope("/api/requests-elsewhere", "GET")).toBeNull();
  });

  it("treats query-style search POSTs as reads", () => {
    expect(resolveRequiredScope("/api/search", "POST")).toBe("games:read");
    expect(resolveRequiredScope("/api/igdb", "POST")).toBe("games:read");
    expect(resolveRequiredScope("/api/romm/cross-reference", "POST")).toBe(
      "games:read",
    );
    // Takes a list of game IDs and returns their watchlist status.
    expect(resolveRequiredScope("/api/watchlist/batch", "POST")).toBe(
      "watchlist:read",
    );
  });

  it("distinguishes watchlist reads from writes", () => {
    expect(resolveRequiredScope("/api/watchlist/status/1234", "GET")).toBe(
      "watchlist:read",
    );
    expect(resolveRequiredScope("/api/watchlist/add", "POST")).toBe(
      "watchlist:write",
    );
    expect(resolveRequiredScope("/api/watchlist/remove", "POST")).toBe(
      "watchlist:write",
    );
  });

  it("splits cache stats by method", () => {
    expect(resolveRequiredScope("/api/cache/stats", "GET")).toBe("admin:read");
    expect(resolveRequiredScope("/api/cache/stats", "DELETE")).toBe(
      "admin:write",
    );
  });

  it("resolves nested game routes", () => {
    expect(resolveRequiredScope("/api/games/popular", "GET")).toBe(
      "games:read",
    );
    expect(resolveRequiredScope("/api/browse/genres/rpg", "GET")).toBe(
      "games:read",
    );
  });

  it("treats HEAD as GET", () => {
    expect(resolveRequiredScope("/api/request", "HEAD")).toBe("requests:read");
  });

  it("denies unmapped paths and unmapped methods", () => {
    expect(resolveRequiredScope("/api/some-future-route", "GET")).toBeNull();
    // /api/request has no DELETE rule; falling through to null means deny.
    expect(resolveRequiredScope("/api/request", "DELETE")).toBeNull();
  });
});

describe("scope enforcement", () => {
  it("admits a key holding exactly the required scope", () => {
    const required = resolveRequiredScope("/api/request", "GET");
    expect(verifyScopes(["requests:read"], [required])).toBe(true);
  });

  it("rejects a read-only key attempting a write", () => {
    const required = resolveRequiredScope("/api/request", "POST");
    expect(verifyScopes(["requests:read"], [required])).toBe(false);
  });

  it("rejects a key scoped to an unrelated resource", () => {
    const required = resolveRequiredScope("/api/request", "GET");
    expect(verifyScopes(["games:read"], [required])).toBe(false);
  });

  it("admits a wildcard key everywhere", () => {
    for (const [path, method] of [
      ["/api/request", "POST"],
      ["/api/cache/clear", "POST"],
      ["/api/watchlist/add", "POST"],
    ]) {
      expect(verifyScopes(["*"], [resolveRequiredScope(path, method)])).toBe(
        true,
      );
    }
  });

  it("rejects a key with no scopes at all", () => {
    const required = resolveRequiredScope("/api/request", "GET");
    expect(verifyScopes([], [required])).toBe(false);
  });
});
