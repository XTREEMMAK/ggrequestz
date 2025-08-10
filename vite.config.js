import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: true, // Allow external access when --host flag is used
    port: 5174,
    allowedHosts: ["ggr.keyjaycompound.com", "localhost", "127.0.0.1"],
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor libraries into separate chunks for better caching
        manualChunks: {
          vendor: ['svelte'],
          icons: ['@iconify/svelte'],
          utils: ['$lib/utils.js', '$lib/auth.client.js', '$lib/api.client.js']
        }
      }
    },
    // Reduce chunk size warning threshold to catch large bundles
    chunkSizeWarningLimit: 600,
    // Enable source maps for better debugging (remove in production)
    sourcemap: false,
    // Enable minification for smaller bundle sizes
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['@iconify/svelte'],
    exclude: ['@iconify-json/*'] // Don't pre-bundle icon sets
  }
});
