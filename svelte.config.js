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
      // Disable CSRF protection for setup routes during initial setup
      checkOrigin: false,
    },
    csp: {
      mode: process.env.NODE_ENV === "development" ? "auto" : "hash",
      directives: {
        "script-src": [
          "self",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
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
