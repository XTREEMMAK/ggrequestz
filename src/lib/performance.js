/**
 * Performance optimization utilities - Main entry point
 * Provides lightweight exports and lazy loading for heavy features
 */

// Import lightweight lazy loader immediately
export { lazyLoader } from "./performance/lazyLoader.js";

// Export actual classes for testing
export { ResourcePrefetcher } from "./performance/prefetcher.js";
export { PerformanceMetrics } from "./performance/metrics.js";

// Lazy load heavy utilities only when needed
let _prefetcher = null;
let _metrics = null;
let _ImageOptimizer = null;
let _BundleOptimizer = null;

/**
 * Get prefetcher instance (lazy loaded)
 */
export const prefetcher = {
  async prefetch(...args) {
    if (!_prefetcher) {
      const module = await import("./performance/prefetcher.js");
      _prefetcher = module.prefetcher;
    }
    return _prefetcher.prefetch(...args);
  },
};

/**
 * Get metrics instance (lazy loaded)
 */
export const metrics = {
  async measure(...args) {
    if (!_metrics) {
      const module = await import("./performance/metrics.js");
      _metrics = module.metrics;
    }
    return _metrics.measure(...args);
  },
  async startTiming(...args) {
    if (!_metrics) {
      const module = await import("./performance/metrics.js");
      _metrics = module.metrics;
    }
    return _metrics.startTiming(...args);
  },
  async endTiming(...args) {
    if (!_metrics) {
      const module = await import("./performance/metrics.js");
      _metrics = module.metrics;
    }
    return _metrics.endTiming(...args);
  },
};

/**
 * Get ImageOptimizer class (lazy loaded)
 */
export const ImageOptimizer = {
  async optimizeImage(...args) {
    if (!_ImageOptimizer) {
      const module = await import("./performance/imageOptimizer.js");
      _ImageOptimizer = module.ImageOptimizer;
    }
    return _ImageOptimizer.optimizeImage(...args);
  },
  async generateSrcSet(...args) {
    if (!_ImageOptimizer) {
      const module = await import("./performance/imageOptimizer.js");
      _ImageOptimizer = module.ImageOptimizer;
    }
    return _ImageOptimizer.generateSrcSet(...args);
  },
};

/**
 * Get BundleOptimizer class (lazy loaded)
 */
export const BundleOptimizer = {
  async loadModule(...args) {
    if (!_BundleOptimizer) {
      const module = await import("./performance/imageOptimizer.js");
      _BundleOptimizer = module.BundleOptimizer;
    }
    return _BundleOptimizer.loadModule(...args);
  },
  async loadComponent(...args) {
    if (!_BundleOptimizer) {
      const module = await import("./performance/imageOptimizer.js");
      _BundleOptimizer = module.BundleOptimizer;
    }
    return _BundleOptimizer.loadComponent(...args);
  },
};