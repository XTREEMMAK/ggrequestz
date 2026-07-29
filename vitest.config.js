import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

// Shared by both projects. Server modules import $env/dynamic/private at
// runtime, which does not exist outside a SvelteKit build.
const alias = {
  "$env/dynamic/private": new URL("./src/tests/mocks/env.js", import.meta.url)
    .pathname,
  // PUBLIC_-prefixed variables live here, not in the private module.
  "$env/dynamic/public": new URL(
    "./src/tests/mocks/env-public.js",
    import.meta.url,
  ).pathname,
};

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // Two projects, because the suites need different globals. Component and
    // utility tests need a DOM; server-side tests must not have one, or code
    // that branches on `browser` takes the wrong path.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.{test,spec}.{js,ts}"],
          environment: "jsdom",
          setupFiles: ["./src/tests/setup.js"],
          globals: true,
          alias,
          server: { deps: { inline: ["@testing-library/svelte"] } },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.{test,spec}.{js,ts}"],
          environment: "node",
          globals: true,
          alias,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/tests/",
        "tests/",
        "build/",
        ".svelte-kit/",
        "static/",
        "scripts/",
        "docs/",
        "**/*.config.js",
        "**/*.config.ts",
        "src/app.html",
        "src/lib/typesense.server.js", // Server-only modules
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
  },
});
