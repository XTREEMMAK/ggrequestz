/**
 * Performance metrics collection - loaded on demand
 * Advanced performance monitoring utilities
 */

import { browser } from "$app/environment";

/**
 * Performance metrics collection
 */
export class PerformanceMetrics {
  constructor() {
    this.metrics = new Map();
    this.observers = new Map();
  }

  /**
   * Start timing an operation
   * @param {string} name - Operation name
   */
  startTiming(name) {
    this.metrics.set(name, performance.now());
  }

  /**
   * End timing an operation
   * @param {string} name - Operation name
   * @returns {number} - Duration in milliseconds
   */
  endTiming(name) {
    const startTime = this.metrics.get(name);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.metrics.delete(name);
    return duration;
  }

  /**
   * Measure function execution time
   * @param {string} name - Measurement name
   * @param {Function} fn - Function to measure
   * @returns {Promise<any>} - Function result
   */
  async measure(name, fn) {
    this.startTiming(name);
    try {
      const result = await fn();
      const duration = this.endTiming(name);
      console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      this.endTiming(name);
      throw error;
    }
  }

  /**
   * Observe Largest Contentful Paint
   */
  observeLCP() {
    if (!browser || !("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log(`🎨 LCP: ${lastEntry.startTime.toFixed(2)}ms`);
    });

    observer.observe({ entryTypes: ["largest-contentful-paint"] });
    this.observers.set("lcp", observer);
  }

  /**
   * Observe First Input Delay
   */
  observeFID() {
    if (!browser || !("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        console.log(`⚡ FID: ${entry.processingStart - entry.startTime}ms`);
      });
    });

    observer.observe({ entryTypes: ["first-input"] });
    this.observers.set("fid", observer);
  }

  /**
   * Disconnect all observers
   */
  disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }
}

// Create singleton instance
export const metrics = new PerformanceMetrics();

// Initialize performance monitoring in development
if (browser && import.meta.env.DEV) {
  metrics.observeLCP();
  metrics.observeFID();
}

// Cleanup on page unload
if (browser) {
  window.addEventListener("beforeunload", () => {
    metrics.disconnect();
  });
}
