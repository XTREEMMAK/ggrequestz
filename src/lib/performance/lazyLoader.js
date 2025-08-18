/**
 * Lightweight lazy loading utility - loaded immediately
 * Minimal footprint for critical image loading functionality
 */

import { browser } from "$app/environment";

/**
 * Minimal Intersection Observer for lazy loading
 */
class LazyLoader {
  constructor() {
    this.observer = null;
    this.loadedElements = new WeakSet();
    this.init();
  }

  init() {
    if (!browser || !("IntersectionObserver" in window)) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.loadedElements.has(entry.target)) {
            this.loadElement(entry.target);
            this.loadedElements.add(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "50px 0px", // Start loading 50px before element enters viewport
        threshold: 0.1,
      },
    );
  }

  loadElement(element) {
    // Handle data-src for images
    if (element.dataset.src) {
      element.src = element.dataset.src;
      element.removeAttribute("data-src");
    }

    // Handle data-bg for background images
    if (element.dataset.bg) {
      element.style.backgroundImage = `url(${element.dataset.bg})`;
      element.removeAttribute("data-bg");
    }

    // Trigger custom load event
    element.dispatchEvent(new CustomEvent("lazyload"));
  }

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

  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// Create singleton instance
export const lazyLoader = new LazyLoader();

// Cleanup on page unload
if (browser) {
  window.addEventListener("beforeunload", () => {
    lazyLoader.disconnect();
  });
}