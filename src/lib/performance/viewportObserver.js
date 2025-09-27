/**
 * Viewport-based smart cache preloading
 * Uses Intersection Observer for efficient viewport detection and intelligent preloading
 * Standalone module to avoid circular dependencies
 */

import { browser } from "$app/environment";

class ViewportPreloader {
  constructor() {
    this.observer = null;
    this.preloadedItems = new Set();
    this.preloadQueue = new Map();
    this.isProcessing = false;

    // Configuration
    this.config = {
      rootMargin: "50px 0px 100px 0px", // Preload when 50px above and 100px below viewport
      threshold: 0.1, // Trigger when 10% visible
      maxConcurrentPreloads: 3,
      preloadDelay: 200, // Debounce delay
    };

    if (browser) {
      this.initObserver();
    }
  }

  initObserver() {
    if (!("IntersectionObserver" in window)) {
      console.warn(
        "IntersectionObserver not supported, viewport preloading disabled",
      );
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold,
      },
    );
  }

  handleIntersection(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        this.queuePreload(entry.target);
      }
    }

    // Process queue with debouncing
    this.debounceProcessQueue();
  }

  queuePreload(element) {
    const gameId = element.dataset.gameId;
    const imageUrl = element.dataset.preloadImage;
    const type = element.dataset.preloadType || "game";

    if (!gameId || this.preloadedItems.has(gameId)) {
      return;
    }

    this.preloadQueue.set(gameId, {
      element,
      gameId,
      imageUrl,
      type,
      timestamp: Date.now(),
    });
  }

  debounceProcessQueue() {
    if (this.processTimeout) {
      clearTimeout(this.processTimeout);
    }

    this.processTimeout = setTimeout(() => {
      this.processPreloadQueue();
    }, this.config.preloadDelay);
  }

  async processPreloadQueue() {
    if (this.isProcessing || this.preloadQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const items = Array.from(this.preloadQueue.values());
      const sortedItems = items
        .filter((item) => !this.preloadedItems.has(item.gameId))
        .sort((a, b) => a.timestamp - b.timestamp) // Process oldest first
        .slice(0, this.config.maxConcurrentPreloads);

      const preloadPromises = sortedItems.map((item) => this.preloadItem(item));
      await Promise.allSettled(preloadPromises);

      // Clean up processed items
      sortedItems.forEach((item) => {
        this.preloadQueue.delete(item.gameId);
        this.preloadedItems.add(item.gameId);
      });
    } catch (error) {
      console.warn("Viewport preloading error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  async preloadItem(item) {
    const { gameId, imageUrl, type } = item;

    try {
      // Parallel preloading of different resources
      const promises = [];

      // Preload image if URL provided
      if (imageUrl) {
        promises.push(this.preloadImage(imageUrl));
      }

      // Preload critical game details endpoint without importing dependencies
      if (type === "game") {
        promises.push(
          this.preloadGameData(gameId).catch(() => {}), // Silent fail for preloading
        );
      }

      await Promise.allSettled(promises);

      // Mark element as preloaded
      item.element.setAttribute("data-preloaded", "true");
    } catch (error) {
      console.warn(`Failed to preload item ${gameId}:`, error);
    }
  }

  /**
   * Preload game data using direct fetch to avoid circular dependencies
   * @param {string} gameId - Game ID to preload
   */
  async preloadGameData(gameId) {
    try {
      // Direct fetch without importing API client to avoid circular deps
      const response = await fetch(`/api/games/${gameId}`, {
        credentials: "include",
      });

      if (response.ok) {
        await response.json(); // Parse response to complete the request
      }
    } catch (error) {
      // Silent fail for preloading
    }
  }

  async preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
      img.src = url;
    });
  }

  // Public API methods
  observe(element) {
    if (this.observer && element) {
      this.observer.observe(element);
    }
  }

  unobserve(element) {
    if (this.observer && element) {
      this.observer.unobserve(element);
    }
  }

  observeGameCard(element, gameId, imageUrl) {
    if (!element || !gameId) return;

    element.dataset.gameId = gameId;
    element.dataset.preloadType = "game";
    if (imageUrl) {
      element.dataset.preloadImage = imageUrl;
    }

    this.observe(element);
  }

  // Batch observe multiple elements
  observeAll(elements) {
    elements.forEach((element) => this.observe(element));
  }

  // Clear all cached preloads (useful for page navigation)
  clearCache() {
    this.preloadedItems.clear();
    this.preloadQueue.clear();
  }

  // Get preloading statistics
  getStats() {
    return {
      preloadedCount: this.preloadedItems.size,
      queuedCount: this.preloadQueue.size,
      isProcessing: this.isProcessing,
    };
  }

  // Disconnect observer (cleanup)
  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.processTimeout) {
      clearTimeout(this.processTimeout);
    }
  }
}

// Global viewport preloader instance
export const viewportPreloader = browser ? new ViewportPreloader() : null;

// Convenience functions
export function observeGameCard(element, gameId, imageUrl) {
  if (viewportPreloader) {
    viewportPreloader.observeGameCard(element, gameId, imageUrl);
  }
}

export function observeElement(element) {
  if (viewportPreloader) {
    viewportPreloader.observe(element);
  }
}

export function getPreloadStats() {
  return viewportPreloader ? viewportPreloader.getStats() : null;
}
