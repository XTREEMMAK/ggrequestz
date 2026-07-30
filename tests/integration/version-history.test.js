/**
 * Tests for the About popup's version history (issue #12, part 1).
 *
 * These run in the node project rather than the jsdom one: the module branches on
 * `browser` from `$app/environment`, and a DOM present in the test would send it
 * down the client path.
 */

import { describe, expect, it } from "vitest";
import { getVersionHistory } from "../../src/lib/changelog.server.js";
import packageJson from "../../package.json";

describe("version history from CHANGELOG.md", () => {
  it("reads releases out of the real changelog", () => {
    const history = getVersionHistory(0);

    // The file this parses is the one in the repo, so this asserts the parser and
    // the file agree rather than testing against a fixture that could drift.
    expect(history.length).toBeGreaterThan(0);
    for (const entry of history) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.url).toBe(
        `https://github.com/XTREEMMAK/ggrequestz/releases/tag/v${entry.version}`,
      );
    }
  });

  it("includes the version this build reports", () => {
    const versions = getVersionHistory(0).map((entry) => entry.version);
    expect(versions).toContain(packageJson.version);
  });

  it("skips [Unreleased], which is not a release and carries no date", () => {
    const versions = getVersionHistory(0).map((entry) => entry.version);
    expect(versions).not.toContain("Unreleased");
    expect(versions.every((v) => /^\d/.test(v))).toBe(true);
  });

  it("keeps file order, newest first", () => {
    const history = getVersionHistory(0);
    const dates = history.map((entry) => entry.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("honours the limit", () => {
    const all = getVersionHistory(0);
    expect(getVersionHistory(2)).toEqual(all.slice(0, 2));
    expect(getVersionHistory(2)).toHaveLength(Math.min(2, all.length));
  });
});
