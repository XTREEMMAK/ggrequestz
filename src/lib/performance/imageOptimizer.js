/**
 * Image optimization utilities - loaded on demand
 * Heavy image processing and optimization features
 */

/**
 * Image optimization utilities
 */
export class ImageOptimizer {
  /**
   * Generate responsive image srcset
   * @param {string} baseUrl - Base image URL
   * @param {Array} sizes - Array of sizes [width, height]
   * @returns {string} - srcset string
   */
  static generateSrcSet(
    baseUrl,
    sizes = [
      [400, 600],
      [600, 900],
      [800, 1200],
      [1200, 1800],
    ],
  ) {
    return sizes
      .map(
        ([w, h]) =>
          `${baseUrl.replace("t_cover_big", `t_cover_big,w_${w},h_${h}`)} ${w}w`,
      )
      .join(", ");
  }

  /**
   * Generate responsive sizes attribute
   * @param {Array} breakpoints - Array of [maxWidth, imageWidth] pairs
   * @returns {string} - sizes string
   */
  static generateSizes(
    breakpoints = [
      [768, "100vw"],
      [1024, "50vw"],
      [1440, "33vw"],
      [Infinity, "25vw"],
    ],
  ) {
    return breakpoints
      .map(([maxWidth, size], index) => {
        if (index === breakpoints.length - 1) return size;
        return `(max-width: ${maxWidth}px) ${size}`;
      })
      .join(", ");
  }

  /**
   * Optimize image loading with standard performance attributes
   * @param {string} url - Image URL (should already be proxied if needed)
   * @returns {Object} - Optimized image props
   */
  static optimizeImage(url) {
    if (!url) return {};

    return {
      src: url,
      loading: "lazy",
      decoding: "async",
    };
  }
}

/**
 * Bundle size optimization utilities
 */
export class BundleOptimizer {
  /**
   * Dynamically import modules to reduce initial bundle size
   * @param {string} modulePath - Module path to import
   * @returns {Promise<any>} - Imported module
   */
  static async loadModule(modulePath) {
    try {
      return await import(/* @vite-ignore */ modulePath);
    } catch (error) {
      console.warn(`Dynamic import failed for ${modulePath}:`, error);
      return null;
    }
  }

  /**
   * Load component lazily
   * @param {Function} importFn - Dynamic import function
   * @returns {Promise<any>} - Component
   */
  static async loadComponent(importFn) {
    try {
      const module = await importFn();
      return module.default || module;
    } catch (error) {
      console.warn("Component lazy loading failed:", error);
      return null;
    }
  }
}