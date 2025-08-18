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
      directives: {
        "script-src": [
          "self",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "unsafe-hashes"
        ],
        "object-src": ["none"],
        "base-uri": ["self"],
      },
    },
  },
};

export default config;
