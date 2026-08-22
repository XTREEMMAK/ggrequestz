/**
 * Guards the appearance cache key against drift between its two users.
 *
 * The root layout caches appearance preferences per user; the preferences
 * endpoint invalidates that entry on save. Those were two separate string
 * literals, and when the layout's key changed from `ambient-background-${id}` to
 * `appearance-${id}` the endpoint kept clearing the old one. Nothing failed:
 * invalidating a key that was never written is a no-op, so saving a theme
 * appeared to succeed while the UI kept the previous value until the 60s TTL
 * expired.
 *
 * Both now derive the key from `appearanceCacheKey`. This asserts the source
 * files actually use it rather than reintroducing a literal.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { appearanceCacheKey } from "$lib/cache.js";

const LAYOUT = "src/routes/+layout.server.js";
const ENDPOINT = "src/routes/api/user/preferences/+server.js";

const read = (p) => readFileSync(p, "utf8");

describe("appearanceCacheKey", () => {
  it("is stable and user-scoped", () => {
    expect(appearanceCacheKey(7)).toBe("appearance-7");
    expect(appearanceCacheKey(7)).not.toBe(appearanceCacheKey(8));
  });

  it("is the only way either module names the key", () => {
    for (const file of [LAYOUT, ENDPOINT]) {
      const source = read(file);
      expect(source, `${file} should import the shared key builder`).toContain(
        "appearanceCacheKey",
      );
      // A template literal here is how the two drifted apart last time.
      expect(
        source,
        `${file} builds the appearance key inline instead of using the helper`,
      ).not.toMatch(/`appearance-\$\{/);
    }
  });

  it("still invalidates on save, and not under the superseded name", () => {
    const source = read(ENDPOINT);
    expect(source).toContain("invalidateCache(appearanceCacheKey(userId))");
    expect(
      source,
      "endpoint still clears the pre-1.4.0 key, which nothing writes",
    ).not.toContain("ambient-background-");
  });
});
