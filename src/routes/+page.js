/**
 * Client-side page load with preloadData and preloadCode for optimized loading
 * This runs in the browser and can preload data and code for faster navigation
 */

export async function load({ fetch, data }) {
  // Preload critical components for faster rendering (preloadCode equivalent)
  const componentPreloads = [
    import('../components/GameCard.svelte'),
    import('../components/LoadingSpinner.svelte'),
    import('../components/GameModal.svelte')
  ];
  
  // Execute component preloading in parallel (don't await to avoid blocking)
  Promise.all(componentPreloads).catch(error => {
    console.warn('Component preloading failed:', error);
  });
  
  // Use the server-side data as the base
  const initialData = data;
  
  // Use the server-side data which already includes ROMM availability checks
  let enhancedData = { ...initialData };
  
  // Preload additional data that might be needed for Load More functionality
  const preloadPromises = [];
  
  // If we have initial games, preload the next page in the background
  if (initialData.popularGames?.length > 0) {
    preloadPromises.push(
      fetch('/api/games/popular?page=2&limit=16')
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );
  }
  
  if (initialData.newReleases?.length > 0) {
    preloadPromises.push(
      fetch('/api/games/recent?page=2&limit=16')
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );
  }
  
  // Preload ROMM data if available
  if (initialData.rommAvailable && initialData.newInLibrary?.length > 0) {
    preloadPromises.push(
      fetch('/api/romm/recent?page=2&limit=16')
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );
  }
  
  // Execute all preload requests in parallel without blocking initial render
  const preloadedData = await Promise.allSettled(preloadPromises);
  
  // Cache the preloaded data for use by Load More buttons
  const preloadCache = {
    popularGames: preloadedData[0]?.status === 'fulfilled' ? preloadedData[0].value : null,
    newReleases: preloadedData[1]?.status === 'fulfilled' ? preloadedData[1].value : null,
    newInLibrary: initialData.rommAvailable && preloadedData[2]?.status === 'fulfilled' ? preloadedData[2].value : null
  };
  
  return {
    ...enhancedData,
    preloadCache
  };
}