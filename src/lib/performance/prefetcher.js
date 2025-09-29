/**
 * Resource prefetching utilities - loaded on demand
 * Heavy utilities for advanced performance optimization
 */

import { browser } from "$app/environment";

/**
 * Resource prefetching for critical resources
 */
export class ResourcePrefetcher {
  constructor() {
    this.prefetchedUrls = new Set();
    this.maxPrefetchQueue = 5;
    this.prefetchQueue = [];
    this.isProcessing = false;
  }

  /**
   * Prefetch a critical resource
   * @param {string} url - URL to prefetch
   * @param {string} type - Resource type (script, style, image, fetch)
   * @param {boolean} priority - High priority prefetch
   */
  prefetch(url, type = "fetch", priority = false) {
    if (!browser || this.prefetchedUrls.has(url)) return;

    const prefetchItem = { url, type, priority };

    if (priority) {
      this.prefetchQueue.unshift(prefetchItem);
    } else {
      this.prefetchQueue.push(prefetchItem);
    }

    this.processPrefetchQueue();
  }

  async processPrefetchQueue() {
    if (this.isProcessing || this.prefetchQueue.length === 0) return;

    this.isProcessing = true;

    while (
      this.prefetchQueue.length > 0 &&
      this.prefetchedUrls.size < this.maxPrefetchQueue
    ) {
      const { url, type } = this.prefetchQueue.shift();

      try {
        await this.executePrefetch(url, type);
        this.prefetchedUrls.add(url);
      } catch (error) {}
    }

    this.isProcessing = false;
  }

  async executePrefetch(url, type) {
    switch (type) {
      case "image":
        return this.prefetchImage(url);
      case "script":
        return this.prefetchScript(url);
      case "style":
        return this.prefetchStyle(url);
      case "fetch":
      default:
        return this.prefetchData(url);
    }
  }

  prefetchImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
  }

  prefetchScript(url) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    link.as = "script";
    document.head.appendChild(link);
    return Promise.resolve();
  }

  prefetchStyle(url) {
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    link.as = "style";
    document.head.appendChild(link);
    return Promise.resolve();
  }

  async prefetchData(url) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        cache: "force-cache",
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Create singleton instance
export const prefetcher = new ResourcePrefetcher();
