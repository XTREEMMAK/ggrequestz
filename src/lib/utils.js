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
  
  return title
    .toLowerCase()
    .trim()
    // Remove leading articles
    .replace(/^(the|a|an)\s+/i, "")
    // Replace special characters and spaces with hyphens
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "");
}
