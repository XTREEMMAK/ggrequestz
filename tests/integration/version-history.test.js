/**
 * Tests for the About popup's version history and the sidebar update indicator
 * (issue #12, parts 1 and 2).
 *
 * These run in the node project rather than the jsdom one: both modules branch on
 * `browser` from `$app/environment`, and a DOM present in the test would send them
 * down the client path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVersionHistory } from "../../src/lib/changelog.server.js";
import packageJson from "../../package.json";

/** A GitHub releases/latest payload. */
function releaseResponse(tag) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: tag,
      html_url: `https://github.com/XTREEMMAK/ggrequestz/releases/tag/${tag}`,
    }),
  };
}

/**
 * Import a pristine copy. The snapshot and its failure counter are module-scoped.
 */
async function freshUpdateCheck() {
  vi.resetModules();
  return import("../../src/lib/updateCheck.server.js");
}

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

describe("update check", () => {
  beforeEach(() => {
    delete process.env.UPDATE_CHECK_ENABLED;
    global.fetch = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPDATE_CHECK_ENABLED;
  });

  it("is on by default", async () => {
    const { isUpdateCheckEnabled } = await freshUpdateCheck();
    expect(isUpdateCheckEnabled()).toBe(true);
  });

  it.each(["false", "0", "no", "off", "FALSE", " off "])(
    "treats %s as opted out",
    async (value) => {
      process.env.UPDATE_CHECK_ENABLED = value;
      const { isUpdateCheckEnabled } = await freshUpdateCheck();
      expect(isUpdateCheckEnabled()).toBe(false);
    },
  );

  it("makes no outbound request when opted out", async () => {
    process.env.UPDATE_CHECK_ENABLED = "false";
    const { getUpdateSnapshot, probeForUpdates } = await freshUpdateCheck();

    const snapshot = getUpdateSnapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.updateAvailable).toBe(false);

    // Even the explicit probe must stay off the network for an air-gapped install.
    await probeForUpdates();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reads a snapshot without waiting for the network", async () => {
    // Never resolves: a render path that awaited this would hang.
    global.fetch.mockImplementation(() => new Promise(() => {}));
    const { getUpdateSnapshot } = await freshUpdateCheck();

    const snapshot = getUpdateSnapshot();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.latest).toBe(null);
    expect(snapshot.updateAvailable).toBe(false);
  });

  it("reports an update when the release is newer", async () => {
    global.fetch.mockResolvedValue(releaseResponse("v99.0.0"));
    const { probeForUpdates } = await freshUpdateCheck();

    const snapshot = await probeForUpdates();
    expect(snapshot.latest).toBe("99.0.0");
    expect(snapshot.updateAvailable).toBe(true);
    expect(snapshot.url).toContain("/releases/tag/v99.0.0");
  });

  it("reports no update when the release matches this build", async () => {
    global.fetch.mockResolvedValue(releaseResponse(`v${packageJson.version}`));
    const { probeForUpdates } = await freshUpdateCheck();

    expect((await probeForUpdates()).updateAvailable).toBe(false);
  });

  it("reports no update when the release is older", async () => {
    global.fetch.mockResolvedValue(releaseResponse("v0.0.1"));
    const { probeForUpdates } = await freshUpdateCheck();

    expect((await probeForUpdates()).updateAvailable).toBe(false);
  });

  it("compares versions numerically, not lexically", async () => {
    // The case that matters: "1.10.0" sorts *below* "1.4.0" as a string, so a
    // string comparison would miss this update and keep missing every one after
    // the ninth minor release.
    global.fetch.mockResolvedValue(releaseResponse("v1.10.0"));
    const { probeForUpdates } = await freshUpdateCheck();

    const snapshot = await probeForUpdates();
    expect(snapshot.latest).toBe("1.10.0");
    expect(snapshot.updateAvailable).toBe(true);
  });

  it("ignores a prerelease suffix when comparing", async () => {
    global.fetch.mockResolvedValue(
      releaseResponse(`v${packageJson.version}-rc.1`),
    );
    const { probeForUpdates } = await freshUpdateCheck();

    expect((await probeForUpdates()).updateAvailable).toBe(false);
  });

  it("stays quiet in the snapshot but logs when GitHub rate-limits", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    const { probeForUpdates } = await freshUpdateCheck();

    const snapshot = await probeForUpdates();
    // Nothing for the UI to show...
    expect(snapshot.updateAvailable).toBe(false);
    expect(snapshot.latest).toBe(null);
    // ...but the operator can see why.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("rate limit"),
    );
  });

  it("logs rather than throws when the network fails", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const { probeForUpdates } = await freshUpdateCheck();

    await expect(probeForUpdates()).resolves.toMatchObject({
      updateAvailable: false,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Update check failed"),
    );
  });

  it("logs rather than throws when the payload has no tag", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const { probeForUpdates } = await freshUpdateCheck();

    await expect(probeForUpdates()).resolves.toMatchObject({ latest: null });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("no tag_name"),
    );
  });

  it("backs off further on each consecutive failure", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const { probeForUpdates } = await freshUpdateCheck();

    await probeForUpdates();
    const first = console.warn.mock.calls.at(-1)[0];
    await probeForUpdates();
    const second = console.warn.mock.calls.at(-1)[0];

    // 6h, then 12h. A blocked network must not be retried on every interval.
    expect(first).toContain("next check in 6h");
    expect(second).toContain("next check in 12h");
  });
});
