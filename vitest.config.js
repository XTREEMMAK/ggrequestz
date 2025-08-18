import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.js"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/tests/",
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
    // Mock server-only modules to prevent import errors during testing
    alias: {
      "$env/dynamic/private": "./src/tests/mocks/env.js",
    },
    server: {
      deps: {
        inline: ["@testing-library/svelte"],
      },
    },
  },
});
