import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: true, // Allow external access when --host flag is used
    port: 5174,
    strictPort: true, // Exit if port is already in use instead of trying another
    cors: true, // Enable CORS for development
    headers: {
      "Cache-Control": "no-cache", // Prevent caching issues during development
    },
    allowedHosts: [
      process.env.DOMAIN || "localhost",
      process.env.GGREQUESTZ_HOST || "localhost",
      "localhost",
      "127.0.0.1",
      "192.168.10.54",
    ],
    fs: {
      // Allow serving files from the entire project
      allow: [".."],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor libraries into separate chunks for better caching
        manualChunks: {
          vendor: ["svelte"],
          icons: ["@iconify/svelte"],
          utils: ["$lib/utils.js", "$lib/auth.js", "$lib/api.client.js"],
          cache: ["$lib/gameCache.js", "$lib/cache.js"],
          integrations: ["$lib/clientServices.js"],
          performance: ["$lib/performance.js"],
        },
      },
    },
    // Reduce chunk size warning threshold to catch large bundles
    chunkSizeWarningLimit: 600,
    // Enable source maps for better debugging (remove in production)
    sourcemap: false,
    // Enable minification for smaller bundle sizes
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ["@iconify/svelte", "canvas-confetti"],
    exclude: ["@iconify-json/*"], // Don't pre-bundle icon sets
    // Force dependency pre-bundling for better dev server performance
    force: process.env.NODE_ENV === "development",
  },

  // Performance optimizations
  performance: {
    hints: "warning",
    maxEntrypointSize: 500000,
    maxAssetSize: 300000,
  },

  // Define server-only modules to prevent client-side bundling
  define: {
    global: "globalThis",
  },

  // External server-only dependencies for client build
  ssr: {
    noExternal: [],
  },
});
