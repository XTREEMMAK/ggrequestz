/**
 * Client-side page load with preloadData and preloadCode for optimized loading
 * This runs in the browser and can preload data and code for faster navigation
 */

export async function load({ fetch, data }) {
  // Use the server-side data as the base
  const initialData = data;

  // Use the server-side data which already includes ROMM availability checks
  let enhancedData = { ...initialData };

  // Defer non-critical data preloading to avoid blocking initial render
  // Only preload the most critical next page data in the background
  const preloadCache = {};
  
  // Schedule background preloading after initial render
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      // Only preload one critical resource to avoid overwhelming the browser
      if (initialData.popularGames?.length > 0) {
        fetch("/api/games/popular?page=2&limit=16")
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (data) preloadCache.popularGames = data; })
          .catch(() => {});
      }
    }, 1000); // Delay preloading to after initial page is fully loaded
  }

  return {
    ...enhancedData,
    preloadCache,
  };
}
