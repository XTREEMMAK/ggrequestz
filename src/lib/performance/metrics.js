/**
 * Performance metrics collection - loaded on demand
 * Advanced performance monitoring utilities with comprehensive tracking
 */

import { browser } from "$app/environment";

/**
 * Enhanced Performance metrics collection
 */
export class PerformanceMetrics {
  constructor() {
    this.metrics = new Map();
    this.observers = new Map();
    this.timers = new Map();
    this.enabled = browser && typeof performance !== "undefined";

    // Web Vitals tracking
    this.vitals = {
      fcp: null, // First Contentful Paint
      lcp: null, // Largest Contentful Paint
      fid: null, // First Input Delay
      cls: null, // Cumulative Layout Shift
    };

    // Detailed metrics storage
    this.detailedMetrics = new Map();

    if (this.enabled) {
      this.initComprehensiveTracking();
    }
  }

  /**
   * Initialize comprehensive performance tracking
   */
  initComprehensiveTracking() {
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeFCP();
    this.observeResources();
  }

  /**
   * Start timing an operation with metadata
   * @param {string} name - Operation name
   * @param {Object} metadata - Additional metadata
   */
  startTiming(name, metadata = {}) {
    this.timers.set(name, {
      startTime: performance.now(),
      metadata,
    });
  }

  /**
   * End timing an operation and record detailed metrics
   * @param {string} name - Operation name
   * @param {Object} additionalData - Additional data to record
   * @returns {number} - Duration in milliseconds
   */
  endTiming(name, additionalData = {}) {
    const timer = this.timers.get(name);
    if (!timer) return 0;

    const duration = performance.now() - timer.startTime;
    this.timers.delete(name);

    // Record detailed metric
    this.recordDetailedMetric({
      name,
      duration,
      timestamp: Date.now(),
      ...timer.metadata,
      ...additionalData,
    });

    return duration;
  }

  /**
   * Record a detailed metric
   * @param {Object} metric - Metric data
   */
  recordDetailedMetric(metric) {
    if (!this.enabled) return;

    const category = metric.category || "general";
    if (!this.detailedMetrics.has(category)) {
      this.detailedMetrics.set(category, []);
    }

    this.detailedMetrics.get(category).push(metric);

    // Only log slow operations and important metrics in development
    if (import.meta.env.DEV) {
      const isSlowOperation = metric.duration && metric.duration > 100;
      const isImportantMetric = ["web-vitals", "navigation"].includes(
        metric.category,
      );

      if (isSlowOperation || isImportantMetric) {
        const emoji = this.getMetricEmoji(metric);
        console.log(
          `${emoji} ${metric.name}: ${metric.duration?.toFixed(2)}ms`,
          {
            category: metric.category,
            ...(isSlowOperation && { warning: "Slow operation detected" }),
            ...(metric.url && { url: metric.url.substring(0, 50) + "..." }),
          },
        );
      }
    }

    // Keep only last 100 metrics per category
    const categoryMetrics = this.detailedMetrics.get(category);
    if (categoryMetrics.length > 100) {
      categoryMetrics.splice(0, categoryMetrics.length - 100);
    }
  }

  /**
   * Get appropriate emoji for metric type
   * @private
   */
  getMetricEmoji(metric) {
    const emojiMap = {
      "web-vitals": "🎨",
      api: "🌐",
      database: "🗄️",
      cache: "⚡",
      routing: "🧭",
      resources: "📦",
      rendering: "🖥️",
    };
    return emojiMap[metric.category] || "📊";
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
      this.vitals.lcp = lastEntry.startTime;

      this.recordDetailedMetric({
        name: "LCP",
        category: "web-vitals",
        duration: lastEntry.startTime,
        element: lastEntry.element?.tagName,
        timestamp: Date.now(),
      });
    });

    observer.observe({ entryTypes: ["largest-contentful-paint"] });
    this.observers.set("lcp", observer);
  }

  /**
   * Observe First Contentful Paint
   */
  observeFCP() {
    if (!browser || !("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === "first-contentful-paint") {
          this.vitals.fcp = entry.startTime;

          this.recordDetailedMetric({
            name: "FCP",
            category: "web-vitals",
            duration: entry.startTime,
            timestamp: Date.now(),
          });
        }
      });
    });

    observer.observe({ entryTypes: ["paint"] });
    this.observers.set("fcp", observer);
  }

  /**
   * Observe First Input Delay
   */
  observeFID() {
    if (!browser || !("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const fid = entry.processingStart - entry.startTime;
        this.vitals.fid = fid;

        this.recordDetailedMetric({
          name: "FID",
          category: "web-vitals",
          duration: fid,
          timestamp: Date.now(),
        });
      });
    });

    observer.observe({ entryTypes: ["first-input"] });
    this.observers.set("fid", observer);
  }

  /**
   * Observe Cumulative Layout Shift
   */
  observeCLS() {
    if (!browser || !("PerformanceObserver" in window)) return;

    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }

      this.vitals.cls = clsValue;
      this.recordDetailedMetric({
        name: "CLS",
        category: "web-vitals",
        duration: clsValue,
        timestamp: Date.now(),
      });
    });

    observer.observe({ entryTypes: ["layout-shift"] });
    this.observers.set("cls", observer);
  }

  /**
   * Observe resource loading performance
   */
  observeResources() {
    if (!browser || !("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType === "img" || entry.initiatorType === "fetch") {
          this.recordDetailedMetric({
            name: `resource-load-${entry.initiatorType}`,
            category: "resources",
            duration: entry.duration,
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
            url: entry.name.substring(0, 100), // Truncate long URLs
            timestamp: Date.now(),
          });
        }
      }
    });

    observer.observe({ entryTypes: ["resource"] });
    this.observers.set("resources", observer);
  }

  /**
   * Track API request performance
   * @param {string} url - API URL
   * @param {string} method - HTTP method
   * @param {number} duration - Request duration
   * @param {number} status - HTTP status
   * @param {boolean} cached - Whether response was cached
   */
  trackApiRequest(url, method, duration, status, cached = false) {
    this.recordDetailedMetric({
      name: "api-request",
      category: "api",
      duration,
      url: url.substring(0, 100), // Truncate long URLs
      method,
      status,
      cached,
      timestamp: Date.now(),
    });
  }

  /**
   * Track navigation performance
   * @param {string} route - Route navigated to
   * @param {number} loadTime - Time to load page
   */
  trackNavigation(route, loadTime) {
    this.recordDetailedMetric({
      name: "navigation",
      category: "routing",
      duration: loadTime,
      route,
      timestamp: Date.now(),
    });
  }

  /**
   * Get performance summary
   * @param {string} category - Optional category filter
   * @returns {Object} Performance summary
   */
  getSummary(category = null) {
    const categories = category
      ? [category]
      : Array.from(this.detailedMetrics.keys());
    const summary = {};

    for (const cat of categories) {
      const metrics = this.detailedMetrics.get(cat) || [];
      if (metrics.length === 0) continue;

      const durations = metrics
        .map((m) => m.duration)
        .filter((d) => typeof d === "number");

      summary[cat] = {
        count: metrics.length,
        avgDuration:
          durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0,
        minDuration: durations.length > 0 ? Math.min(...durations) : 0,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        recent: metrics.slice(-10), // Last 10 metrics
      };
    }

    return {
      summary,
      webVitals: this.vitals,
      timestamp: Date.now(),
    };
  }

  /**
   * Get slow operations (above threshold)
   * @param {number} threshold - Duration threshold in ms
   * @returns {Array} Slow operations
   */
  getSlowOperations(threshold = 100) {
    const slowOps = [];

    for (const [category, metrics] of this.detailedMetrics) {
      for (const metric of metrics) {
        if (metric.duration && metric.duration > threshold) {
          slowOps.push({ category, ...metric });
        }
      }
    }

    return slowOps.sort((a, b) => b.duration - a.duration);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.detailedMetrics.clear();
    this.timers.clear();
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

// Initialize comprehensive performance monitoring
if (browser && import.meta.env.DEV) {
  console.log("🔍 Performance monitoring enabled");
}

// Cleanup on page unload
if (browser) {
  window.addEventListener("beforeunload", () => {
    metrics.disconnect();
  });
}

// Convenience functions for external use
export function startTimer(name, metadata) {
  metrics.startTiming(name, metadata);
}

export function endTimer(name, additionalData) {
  return metrics.endTiming(name, additionalData);
}

export function measureAsync(name, fn) {
  return metrics.measure(name, fn);
}

export function trackApiRequest(url, method, duration, status, cached) {
  metrics.trackApiRequest(url, method, duration, status, cached);
}

export function trackNavigation(route, loadTime) {
  metrics.trackNavigation(route, loadTime);
}

export function getPerformanceSummary(category) {
  return metrics.getSummary(category);
}

export function getSlowOperations(threshold) {
  return metrics.getSlowOperations(threshold);
}
