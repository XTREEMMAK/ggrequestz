/**
 * Search normalization utilities for game titles
 */

const ARTICLES = ["the", "a", "an"];
const NUMBER_WORDS = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
};

const COMMON_ABBREVIATIONS = {
  versus: "vs",
  and: "&",
  part: "pt",
  episode: "ep",
  chapter: "ch",
};

/**
 * Normalize a game title for better search matching
 * @param {string} title - The game title to normalize
 * @returns {string} - The normalized title
 */
export function normalizeTitle(title) {
  if (!title || typeof title !== "string") return "";

  let normalized = title.toLowerCase().trim();

  // Remove punctuation and special characters except spaces and numbers
  normalized = normalized.replace(/[^\w\s]/g, " ");

  // Convert multiple spaces to single space
  normalized = normalized.replace(/\s+/g, " ");

  // Split into words
  let words = normalized.split(" ").filter((word) => word.length > 0);

  // Remove articles from the beginning
  if (words.length > 1 && ARTICLES.includes(words[0])) {
    words = words.slice(1);
  }

  // Convert written numbers to digits
  words = words.map((word) => NUMBER_WORDS[word] || word);

  // Apply common abbreviations
  words = words.map((word) => COMMON_ABBREVIATIONS[word] || word);

  return words.join(" ");
}

/**
 * Create search variations for a game title
 * @param {string} title - The original title
 * @returns {string[]} - Array of title variations
 */
export function createSearchVariations(title) {
  const variations = new Set();

  // Original title
  variations.add(title);

  // Normalized version
  const normalized = normalizeTitle(title);
  variations.add(normalized);

  // Without articles
  const withoutArticles = title.toLowerCase().replace(/^(the|a|an)\s+/i, "");
  variations.add(withoutArticles);

  // With common substitutions
  variations.add(title.replace(/\&/g, "and"));
  variations.add(title.replace(/\band\b/g, "&"));

  return Array.from(variations).filter((v) => v.length > 0);
}

/**
 * Debounce function for search input
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date string
 */
export function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

/**
 * Generate a random ID
 * @returns {string} - Random ID
 */
export function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Generate a URL-friendly slug from a game title
 * @param {string} title - The game title
 * @returns {string} - URL-friendly slug
 */
export function generateSlug(title) {
  if (!title || typeof title !== "string") return "";

  return (
    title
      .toLowerCase()
      .trim()
      // Remove leading articles
      .replace(/^(the|a|an)\s+/i, "")
      // Replace special characters and spaces with hyphens
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Create a promise with timeout for better error handling
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Custom timeout message
 * @returns {Promise} - Promise that rejects on timeout
 */
export function withTimeout(
  promise,
  timeoutMs = 5000,
  timeoutMessage = "Operation timed out",
) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
}

/**
 * Retry a promise-returning function with exponential backoff
 * @param {Function} fn - Function that returns a Promise
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @returns {Promise} - The eventual result or final error
 */
export async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Safely execute an async function with timeout and error handling
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds (default: 5000)
 * @param {any} options.fallback - Fallback value on error (default: null)
 * @param {string} options.errorContext - Context for error logging
 * @returns {Promise} - Result or fallback value
 */
export async function safeAsync(fn, options = {}) {
  const {
    timeout = 5000,
    fallback = null,
    errorContext = "Operation",
  } = options;

  try {
    return await withTimeout(
      fn(),
      timeout,
      `${errorContext} timed out after ${timeout}ms`,
    );
  } catch (error) {
    console.warn(`${errorContext} failed:`, error.message);
    return fallback;
  }
}

/**
 * Create a hover preloader for data fetching
 * @param {Function} fetchFn - Function that returns a promise
 * @param {Object} options - Options for preloading
 * @param {number} options.delay - Delay before starting preload (default: 100ms)
 * @param {string} options.cacheKey - Key for storing preloaded data
 * @returns {Object} - Object with preload and cache functions
 */
export function createHoverPreloader(fetchFn, options = {}) {
  const { delay = 100, cacheKey } = options;
  let preloadTimer = null;
  let preloadPromise = null;
  let cachedData = null;

  const preload = () => {
    if (preloadTimer) clearTimeout(preloadTimer);

    preloadTimer = setTimeout(async () => {
      if (!preloadPromise) {
        preloadPromise = safeAsync(fetchFn, {
          timeout: 8000,
          fallback: null,
          errorContext: "Hover preload",
        });

        try {
          cachedData = await preloadPromise;
          if (cacheKey && cachedData) {
            sessionStorage.setItem(cacheKey, JSON.stringify(cachedData));
          }
        } catch (error) {
          console.warn("Hover preload failed:", error);
        }
      }
    }, delay);
  };

  const cancel = () => {
    if (preloadTimer) {
      clearTimeout(preloadTimer);
      preloadTimer = null;
    }
  };

  const getCached = () => {
    if (cachedData) return cachedData;

    if (cacheKey) {
      try {
        const stored = sessionStorage.getItem(cacheKey);
        if (stored) {
          cachedData = JSON.parse(stored);
          return cachedData;
        }
      } catch (error) {
        console.warn("Failed to parse cached data:", error);
      }
    }

    return null;
  };

  return { preload, cancel, getCached, getPromise: () => preloadPromise };
}
