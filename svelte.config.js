import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    prerender: {
      handleHttpError: ({ path, referrer, message }) => {
        // ignore 404s for now
        if (message.includes("404")) {
          return;
        }
        // otherwise fail the build
        throw new Error(message);
      },
    },
    csrf: {
      // Origin checking is enabled. The comment here used to say this was
      // "for setup routes during initial setup", but `false` disabled it for
      // the entire application, on every form action and POST.
      //
      // If a genuine setup-time exemption is needed, scope it in
      // hooks.server.js for the specific /api/setup/ paths rather than
      // switching it off globally.
      checkOrigin: true,
    },
    csp: {
      // 'nonce', not 'hash'. Streamed promises returned from `load` emit their
      // inline <script> chunks after the response headers have been flushed,
      // so hash mode cannot include them in the header and blocks every one;
      // the streamed sections then never resolve.
      //
      // NOTE: while 'unsafe-inline' remains in script-src below, SvelteKit
      // emits neither hashes nor nonces at all (it treats the directive as
      // already permitting inline scripts), so this setting is currently
      // inert. It is set correctly here so that removing 'unsafe-inline'
      // (which is the actual CSP hardening work) does not silently break
      // streaming at the same time.
      mode: process.env.NODE_ENV === "development" ? "auto" : "nonce",
      directives: {
        "script-src": [
          "self",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://static.cloudflareinsights.com",
          "unsafe-hashes",
          "unsafe-inline", // Allow inline scripts for debugging
        ],
        "object-src": ["none"],
        "base-uri": ["self"],
        "worker-src": ["self", "blob:"],
      },
    },
  },
};

export default config;
