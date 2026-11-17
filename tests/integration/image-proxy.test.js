/**
 * Regression tests for the public image proxy (GHSA-x924-4wmw-r73c).
 *
 * The proxy accepted any host whose name *contained* an allowed one, followed
 * redirects anywhere, and served whatever Content-Type the remote side chose.
 * An anonymous caller could reach internal services and serve HTML from this
 * origin. Verified live against the test stack before the fix: a request for
 * `http://images.igdb.com.127.0.0.1.nip.io:3000/login` returned the app's own
 * login page as text/html.
 *
 * Each case below pins one rule. None of them may be weakened to make another
 * change pass.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map();
const cache = {
  get: vi.fn(async (key) => store.get(key) ?? null),
  set: vi.fn(async (key, value) => {
    store.set(key, value);
  }),
};
vi.mock("$lib/cache.js", () => ({ default: cache }));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function upstream(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

async function callProxy(target) {
  const { GET } = await import("../../src/routes/api/images/proxy/+server.js");
  const url = new URL("http://localhost/api/images/proxy");
  if (target !== undefined) url.searchParams.set("url", target);
  return GET({ url });
}

/** Run a call expected to fail and return the SvelteKit HttpError status. */
async function statusOf(target) {
  try {
    await callProxy(target);
  } catch (err) {
    return err.status;
  }
  return 200;
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  global.fetch = vi.fn(async () =>
    upstream(JPEG, { headers: { "content-type": "image/jpeg" } }),
  );
});

describe("image proxy: which URLs it will fetch", () => {
  it.each([
    [
      "substring of an allowed host",
      "https://images.igdb.com.attacker.example/x.jpg",
    ],
    ["allowed host as a prefix label", "https://ximages.igdb.com/x.jpg"],
    [
      "loopback through a wildcard DNS name",
      "http://images.igdb.com.127.0.0.1.nip.io:3000/login",
    ],
    [
      "credentials before the host",
      "https://images.igdb.com@169.254.169.254/latest/meta-data/",
    ],
    [
      "credentials on an allowed host",
      "https://user:pass@images.igdb.com/x.jpg",
    ],
    ["explicit non-default port", "https://images.igdb.com:8443/x.jpg"],
    ["trailing dot", "https://images.igdb.com./x.jpg"],
    [
      "hosts that used to be listed but have no caller",
      "https://media.rawg.io/x.jpg",
    ],
    ["non-http scheme", "file:///etc/passwd"],
    ["data URL", "data:text/html,<script>alert(1)</script>"],
    ["relative path", "/api/health"],
    ["internal service name", "http://redis:6379/"],
  ])("refuses %s, without fetching", async (_label, target) => {
    expect(await statusOf(target)).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses a missing url parameter", async () => {
    expect(await statusOf(undefined)).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses an oversized url parameter", async () => {
    const long = `https://images.igdb.com/${"a".repeat(3000)}.jpg`;
    expect(await statusOf(long)).toBe(403);
  });

  it.each([
    ["https", "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg"],
    [
      "http, upgraded",
      "http://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg",
    ],
    [
      "protocol-relative, from older cached rows",
      "//images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg",
    ],
    [
      "upper-case host",
      "https://IMAGES.IGDB.COM/igdb/image/upload/t_cover_big/co1.jpg",
    ],
  ])("fetches %s over https from the exact host", async (_label, target) => {
    const response = await callProxy(target);
    expect(response.status).toBe(200);
    const [fetched, options] = global.fetch.mock.calls[0];
    expect(fetched).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg",
    );
    expect(options.redirect).toBe("manual");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers["Accept-Encoding"]).toBe("identity");
  });
});

describe("image proxy: what it will serve", () => {
  const target =
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg";

  it("serves a raster image with its canonical type and a sandbox CSP", async () => {
    global.fetch = vi.fn(async () =>
      upstream(JPEG, {
        headers: { "content-type": "Image/JPEG; charset=binary" },
      }),
    );
    const response = await callProxy(target);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG);
  });

  it.each(["text/html", "image/svg+xml", "application/javascript", ""])(
    "refuses an upstream %s body and does not cache it",
    async (type) => {
      global.fetch = vi.fn(async () =>
        upstream("<html><script>alert(1)</script></html>", {
          headers: type ? { "content-type": type } : {},
        }),
      );
      expect(await statusOf(target)).toBe(502);
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it("refuses a body that declares more than the size limit", async () => {
    global.fetch = vi.fn(async () =>
      upstream(JPEG, {
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(50 * 1024 * 1024),
        },
      }),
    );
    expect(await statusOf(target)).toBe(502);
  });

  it("stops reading a body that exceeds the limit without declaring it", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent++ < 10) controller.enqueue(chunk);
        else controller.close();
      },
    });
    global.fetch = vi.fn(async () =>
      upstream(stream, { headers: { "content-type": "image/jpeg" } }),
    );
    expect(await statusOf(target)).toBe(502);
    expect(sent).toBeLessThan(10);
  });

  it("passes a missing image through as 404", async () => {
    global.fetch = vi.fn(async () => upstream("not found", { status: 404 }));
    expect(await statusOf(target)).toBe(404);
  });

  it("reports a timeout as 504", async () => {
    global.fetch = vi.fn(async () => {
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
    });
    expect(await statusOf(target)).toBe(504);
  });

  it("does not serve a cached entry whose type is not a raster image", async () => {
    const { createHash } = await import("crypto");
    const key = `img:${createHash("md5").update(target).digest("hex")}`;
    store.set(
      key,
      JSON.stringify({
        data: Buffer.from("<html>").toString("base64"),
        contentType: "text/html",
      }),
    );
    const response = await callProxy(target);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});

describe("image proxy: redirects", () => {
  const target =
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg";

  it.each([
    ["an internal address", "http://169.254.169.254/latest/meta-data/"],
    ["a look-alike host", "https://images.igdb.com.attacker.example/x.jpg"],
    ["an allowed host on another port", "https://images.igdb.com:8080/x.jpg"],
  ])(
    "refuses a redirect to %s without following it",
    async (_label, location) => {
      global.fetch = vi.fn(async () =>
        upstream(null, { status: 302, headers: { location } }),
      );
      expect(await statusOf(target)).toBe(502);
      expect(global.fetch).toHaveBeenCalledOnce();
    },
  );

  it("follows a redirect that stays on the allowed host", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        upstream(null, {
          status: 301,
          headers: { location: "/igdb/image/upload/t_cover_big/co2.jpg" },
        }),
      )
      .mockResolvedValueOnce(
        upstream(JPEG, { headers: { "content-type": "image/jpeg" } }),
      );
    const response = await callProxy(target);
    expect(response.status).toBe(200);
    expect(global.fetch.mock.calls[1][0]).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co2.jpg",
    );
  });

  it("gives up after the redirect limit", async () => {
    global.fetch = vi.fn(async () =>
      upstream(null, { status: 302, headers: { location: target } }),
    );
    expect(await statusOf(target)).toBe(502);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
