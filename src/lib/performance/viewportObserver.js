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
    this.isMobile = this.detectMobileDevice();
    this.debugLogging = this.shouldEnableDebugLogging();

    // Mobile-specific configuration for more aggressive caching
    this.config = this.isMobile
      ? {
          rootMargin: "100px 0px 200px 0px", // Larger buffer for mobile (slower networks)
          threshold: 0.05, // Trigger earlier for mobile
          maxConcurrentPreloads: 2, // Fewer concurrent to avoid overwhelming mobile networks
          preloadDelay: 100, // Faster response for mobile
          aggressiveMode: true, // Enable background pre-caching
        }
      : {
          rootMargin: "50px 0px 100px 0px", // Standard buffer for desktop
          threshold: 0.1, // Standard threshold
          maxConcurrentPreloads: 3,
          preloadDelay: 200,
          aggressiveMode: false,
        };

    if (browser) {
      this.initObserver();
      // Always log initialization to verify the observer is loading
    }
  }

  detectMobileDevice() {
    if (!browser) return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  shouldEnableDebugLogging() {
    if (!browser) return false;
    // Use import.meta.env for client-side environment variables in Vite
    return (
      import.meta.env.DEV &&
      import.meta.env.VITE_DEBUG_VIEWPORT_CACHING === "true"
    );
  }

  log(...args) {
    if (this.debugLogging) {
      console.log("[ViewportPreloader]", ...args);
    }
  }

  initObserver() {
    if (!("IntersectionObserver" in window)) {
      this.log(
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
        const gameId = entry.target.dataset.gameId;
        this.log(
          `Card entering viewport: ${gameId} (mobile: ${this.isMobile})`,
        );
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
    } finally {
      this.isProcessing = false;
    }
  }

  async preloadItem(item) {
    const { gameId, imageUrl, type } = item;
    const startTime = Date.now();

    try {
      // Parallel preloading of different resources
      const promises = [];

      // Preload image if URL provided
      if (imageUrl) {
        this.log(`Preloading image for game ${gameId}`);
        promises.push(this.preloadImage(imageUrl));
      }

      // Preload critical game details endpoint without importing dependencies
      if (type === "game") {
        this.log(`Preloading game data for ${gameId}`);
        promises.push(
          this.preloadGameData(gameId).catch(() => {}), // Silent fail for preloading
        );
      }

      // On mobile with aggressive mode, also preload screenshots
      if (this.isMobile && this.config.aggressiveMode && type === "game") {
        this.log(`Aggressive preloading screenshots for mobile game ${gameId}`);
        promises.push(
          this.preloadGameScreenshots(gameId).catch(() => {}), // Silent fail
        );
      }

      await Promise.allSettled(promises);

      // Mark element as preloaded
      item.element.setAttribute("data-preloaded", "true");

      const duration = Date.now() - startTime;
      this.log(`Preloaded ${gameId} in ${duration}ms`);
    } catch (error) {}
  }

  /**
   * Preload game data using direct fetch to avoid circular dependencies
   * Optimized for Redis caching with proper cache headers
   * @param {string} gameId - Game ID to preload
   */
  async preloadGameData(gameId) {
    try {
      // Direct fetch with cache-friendly headers
      const response = await fetch(`/api/games/${gameId}`, {
        credentials: "include",
        headers: {
          "Cache-Control": "public, max-age=900", // 15 minutes cache hint
          "X-Preload-Request": "true", // Mark as preload for potential server optimization
        },
      });

      if (response.ok) {
        const gameData = await response.json();
        this.log(
          `Successfully preloaded game data for ${gameId} (cached: ${response.headers.get("x-cache-status") || "unknown"})`,
        );

        // For mobile aggressive mode, also warm related data
        if (this.isMobile && this.config.aggressiveMode && gameData) {
          this.warmRelatedData(gameData);
        }

        return gameData;
      }
    } catch (error) {
      this.log(`Failed to preload game data for ${gameId}:`, error.message);
    }
  }

  /**
   * Preload game screenshots for mobile aggressive caching
   * @param {string} gameId - Game ID to preload screenshots for
   */
  async preloadGameScreenshots(gameId) {
    try {
      // First get the game data to check for screenshots
      const response = await fetch(`/api/games/${gameId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const gameData = await response.json();
        const screenshots = gameData.screenshots || [];

        if (screenshots.length > 0) {
          // Preload first 2-3 screenshots for mobile to avoid overwhelming
          const screenshotsToPreload = screenshots.slice(0, 3);
          const imagePromises = screenshotsToPreload.map((url) =>
            this.preloadImage(url),
          );

          await Promise.allSettled(imagePromises);
          this.log(
            `Preloaded ${screenshotsToPreload.length} screenshots for game ${gameId}`,
          );
        }
      }
    } catch (error) {
      this.log(`Failed to preload screenshots for ${gameId}:`, error.message);
    }
  }

  async preloadImage(url) {
    this.log(`🖼️ Attempting to preload image URL: ${url}`);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.log(`✅ Image preload successful: ${url}`);
        resolve(img);
      };
      img.onerror = (error) => {
        this.log(`❌ Image preload failed: ${url}`, error);
        reject(new Error(`Failed to preload image: ${url}`));
      };
      img.src = url;
    });
  }

  /**
   * Warm related data for mobile aggressive caching
   * @param {Object} gameData - Game data to extract related info from
   */
  warmRelatedData(gameData) {
    if (!this.config.aggressiveMode) return;

    // Warm cache for similar games from same platforms/genres (low priority)
    if (gameData.platforms && gameData.platforms.length > 0) {
      // Defer related data warming to not block main preloading
      setTimeout(() => {
        this.log(`Warming related data cache for ${gameData.igdb_id}`);
        // Could fetch related games by platform/genre in the future
      }, 2000);
    }
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
    if (!element || !gameId) {
      return;
    }

    element.dataset.gameId = gameId;
    element.dataset.preloadType = "game";
    if (imageUrl) {
      element.dataset.preloadImage = imageUrl;
    }

    // Always log when we start observing a card
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
      isMobile: this.isMobile,
      aggressiveMode: this.config.aggressiveMode,
      config: this.config,
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
