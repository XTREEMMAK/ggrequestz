import { browser } from "$app/environment";

class ScrollManager {
  constructor() {
    this.positions = new Map();
    this.sessionKey = "homepage_scroll_data";

    // Load from sessionStorage on init
    if (browser) {
      this.loadFromStorage();
    }
  }

  savePosition(path, scrollY, additionalData = {}) {
    if (!browser) return;

    const data = {
      scrollY,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      isMobile:
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        ),
      ...additionalData,
    };

    this.positions.set(path, data);
    this.saveToStorage();
    console.log(
      "📍 Saved scroll position for",
      path,
      ":",
      scrollY,
      "Mobile:",
      data.isMobile,
    );
  }

  restorePosition(path, options = {}) {
    if (!browser) return false;

    const data = this.positions.get(path);
    if (!data) return false;

    const { delay = 0, maxRetries = 15, onComplete } = options;
    const isMobile =
      data.isMobile ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    const attemptRestore = (retryCount = 0) => {
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const targetScroll = Math.min(data.scrollY, maxScroll);

      // For mobile, be more lenient with the scroll position check
      const threshold = isMobile ? 0.8 : 0.9;
      const canReachTarget = targetScroll >= data.scrollY * threshold;

      if (canReachTarget || retryCount >= maxRetries) {
        // Use different scroll methods for mobile vs desktop
        if (isMobile) {
          // Mobile browsers sometimes need multiple approaches
          window.scrollTo({ top: targetScroll, behavior: "instant" });
          // Fallback for mobile browsers that don't respect behavior: 'instant'
          setTimeout(() => {
            window.scrollTo(0, targetScroll);
          }, 50);
        } else {
          window.scrollTo({ top: targetScroll, behavior: "instant" });
        }

        if (onComplete) onComplete(targetScroll);
        return true;
      }

      // Use progressive delays, longer for mobile
      const retryDelay = isMobile
        ? retryCount > 10
          ? 300
          : retryCount > 5
            ? 200
            : 150
        : 100;
      setTimeout(() => attemptRestore(retryCount + 1), retryDelay);
    };

    // Mobile needs longer initial delay
    const initialDelay = isMobile ? Math.max(delay, 300) : delay;

    if (initialDelay > 0) {
      setTimeout(() => attemptRestore(), initialDelay);
    } else {
      return attemptRestore();
    }
  }

  getStoredData(path) {
    return this.positions.get(path);
  }

  clear(path) {
    if (path) {
      this.positions.delete(path);
    } else {
      this.positions.clear();
    }
    this.saveToStorage();
  }

  saveToStorage() {
    if (!browser) return;

    const data = Object.fromEntries(this.positions);
    sessionStorage.setItem(this.sessionKey, JSON.stringify(data));
  }

  loadFromStorage() {
    if (!browser) return;

    try {
      const stored = sessionStorage.getItem(this.sessionKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.positions = new Map(Object.entries(data));
      }
    } catch (error) {}
  }
}

// Create singleton instance
export const scrollManager = new ScrollManager();
