<!--
  Overseerr-style poster card component for games
-->

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import StatusBadge from './StatusBadge.svelte';
  import SkeletonLoader from './SkeletonLoader.svelte';
  import { truncateText, formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  import { browser } from '$app/environment';
  import { getGameByIdClient } from '$lib/gameCache.js';
  import { lazyLoader } from '$lib/performance.js';
  
  let { game = {}, showActions = true, showWatchlist = true, isInWatchlist = false, user = null, preserveState = false, enablePreloading = false } = $props();
  
  // Detect if we're on a mobile device
  const isMobile = browser && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  const dispatch = createEventDispatcher();
  
  let truncatedTitle = $derived(truncateText(game.title || 'Unknown Game', 40));
  let releaseDate = $derived(game.release_date ? formatDate(game.release_date) : null);
  let gameStatus = $derived(getGameStatus(game));
  
  // Ghost click effect state
  let isClicked = $state(false);
  
  // Cache warming state
  let hasWarmedCache = false;
  
  function getGameStatus(game) {
    if (game.status) return game.status;
    if (game.popularity > 80) return 'popular';
    if (game.release_date && Date.now() - new Date(game.release_date).getTime() < 30 * 24 * 60 * 60 * 1000) {
      return 'new';
    }
    return 'available';
  }
  
  function handleRequest() {
    dispatch('request', { game });
  }
  
  function handleWatchlist() {
    dispatch('watchlist', { game, add: !isInWatchlist });
  }
  
  function handleClick(event) {
    triggerGhostClick();
    
    // Store referrer information for proper back navigation
    if (browser) {
      sessionStorage.setItem('gameDetailReferrer', window.location.pathname + window.location.search);
    }
    
    // If preserveState is true, prevent default link behavior and use event dispatcher
    if (preserveState) {
      event.preventDefault();
      dispatch('view-details', { game });
    }
    // Otherwise, let the normal link navigation happen
  }

  function handleShowModal() {
    triggerGhostClick();
    dispatch('show-modal', { game });
  }
  
  function triggerGhostClick() {
    isClicked = true;
    setTimeout(() => {
      isClicked = false;
    }, 300);
  }
  
  // Check if game has additional screenshots (more than just cover)
  let hasAdditionalScreenshots = $derived(
    game?.screenshots && game.screenshots.length > 0
  );
  
  let imageError = $state(false);
  let showOverlay = $state(false);
  let imageLoaded = $state(false);
  
  // Image rotation state
  let currentImageIndex = $state(0);
  let rotationInterval = $state(null);
  let isRotating = $state(false);
  
  let allImages = $derived.by(() => {
    let images = [];
    if (game?.cover_url && !imageError) {
      images.push({ url: game.cover_url, type: 'cover' });
    }
    if (game?.screenshots && game.screenshots.length > 0) {
      // Handle different screenshot formats
      const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];
      images.push(...screenshots.map(screenshot => {
        // Handle both string URLs and objects with url property
        // Handle different screenshot data formats
        const url = typeof screenshot === 'string' ? screenshot : 
                   screenshot?.url ? screenshot.url :
                   screenshot?.image_id ? 
                   `/api/images/proxy?url=${encodeURIComponent(`https://images.igdb.com/igdb/image/upload/t_screenshot_med/${screenshot.image_id}.jpg`)}` : 
                   null;
        return url ? { url, type: 'screenshot' } : null;
      }).filter(Boolean));
    }
    return images;
  });
  
  let currentImage = $derived(allImages[currentImageIndex] || { url: game?.cover_url, type: 'cover' });
  let shouldRotate = $derived(allImages.length > 1);
  
  // Reset image index when allImages changes
  $effect(() => {
    if (allImages.length > 0 && currentImageIndex >= allImages.length) {
      currentImageIndex = 0;
    }
  });
  
  // Cleanup effect
  $effect(() => {
    return () => {
      if (rotationInterval) {
        clearInterval(rotationInterval);
        rotationInterval = null;
      }
    };
  });
  
  function handleImageError() {
    imageError = true;
  }
  
  function handleImageLoad() {
    imageLoaded = true;
  }
  
  // Warm cache for game when it comes into view
  async function warmGameCache() {
    if (!hasWarmedCache && enablePreloading) {
      hasWarmedCache = true;
      const gameId = game.igdb_id || game.id;
      if (gameId) {
        try {
          await getGameByIdClient(gameId.toString());
        } catch (error) {
          // Silently fail pre-caching
        }
      }
    }
  }

  // Enhanced lazy loading with performance monitoring
  function lazyLoad(node) {
    // Set up lazy loading for the node
    lazyLoader.observe(node);
    
    // Add custom event listener for when lazy loading completes
    node.addEventListener('lazyload', () => {
      handleImageLoad();
      warmGameCache();
    });
    
    return {
      destroy() {
        lazyLoader.unobserve(node);
      }
    };
  }
  
  function startImageRotation() {
    if (!shouldRotate || isRotating || allImages.length <= 1) {
      return;
    }
    
    isRotating = true;
    rotationInterval = setInterval(() => {
      // Ensure we have valid images array
      if (allImages.length > 1) {
        const newIndex = (currentImageIndex + 1) % allImages.length;
        currentImageIndex = newIndex;
      }
    }, 2500); // Rotate every 2.5 seconds
  }
  
  function stopImageRotation() {
    if (rotationInterval) {
      clearInterval(rotationInterval);
      rotationInterval = null;
    }
    isRotating = false;
    currentImageIndex = 0; // Reset to cover image
  }
  
  function handleMouseEnter() {
    showOverlay = true;
    if (shouldRotate && allImages.length > 1) {
      startImageRotation();
    }
  }
  
  function handleMouseLeave() {
    showOverlay = false;
    stopImageRotation();
  }
  
  // Stop rotation when shouldRotate becomes false
  $effect(() => {
    if (!shouldRotate && rotationInterval) {
      stopImageRotation();
    }
  });
</script>

<a 
  href="/game/{game.igdb_id || game.id}"
  class="poster-card group relative rounded-xl overflow-hidden cursor-pointer aspect-[2/3] bg-gray-800 w-full block {isClicked ? 'ghost-click' : ''}"
  onmouseenter={() => handleMouseEnter()}
  onmouseleave={() => handleMouseLeave()}
  onclick={handleClick}
  aria-label="View details for {game.title || 'Unknown Game'}"
  data-sveltekit-preload-data={enablePreloading ? (isMobile ? "tap" : "hover") : "off"}
  data-game-id={game.igdb_id || game.id}
>
  <!-- Poster Image with rotation -->
  <div class="relative w-full h-full overflow-hidden">
    {#if currentImage?.url && !imageError}
      <!-- Enhanced lazy loading with skeleton -->
      <div class="relative w-full h-full">
        {#if !imageLoaded}
          <div class="absolute inset-0">
            <SkeletonLoader variant="image" width="100%" height="100%" rounded="lg" />
          </div>
        {/if}
        
        <img
          use:lazyLoad
          data-src={currentImage.url}
          alt="{game.title} {currentImage.type}"
          class="w-full h-full object-cover transition-opacity duration-500 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
          loading="lazy"
          decoding="async"
          onerror={handleImageError}
          onload={() => imageLoaded = true}
        />
      </div>
    {:else}
      <div class="w-full h-full flex items-center justify-center text-gray-500">
        <Icon icon="heroicons:photo" class="w-16 h-16" />
      </div>
    {/if}
    
    <!-- Image indicators (only show if multiple images) -->
    {#if shouldRotate && allImages.length > 1}
      <div class="absolute bottom-2 left-2 flex gap-1">
        {#each allImages as _, index}
          <div 
            class="w-1.5 h-1.5 rounded-full transition-colors duration-200 {index === currentImageIndex ? 'bg-white' : 'bg-white/40'}"
          ></div>
        {/each}
      </div>
    {/if}
    
    <!-- Status Badge -->
    <div class="absolute top-2 left-2 opacity-90">
      <StatusBadge status={gameStatus} size="xs" />
    </div>
    
    <!-- Top-right indicators -->
    <div class="absolute top-2 right-2 flex flex-col gap-2">
      <!-- Screenshots indicator -->
      {#if hasAdditionalScreenshots}
        <button
          onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleShowModal(); }}
          class="bg-black bg-opacity-70 text-white p-1 rounded-full hover:bg-opacity-90 transition-all self-end"
          title="View {game.screenshots.length} screenshots"
        >
          <Icon icon="heroicons:photo" class="w-4 h-4" />
        </button>
      {/if}
      
      <!-- Rating (hidden on mobile to prevent overlap) -->
      {#if game.rating}
        <div class="bg-black bg-opacity-80 text-white px-2 py-1 rounded text-xs font-bold hidden sm:block">
          {Math.round(game.rating)}%
        </div>
      {/if}
    </div>
    
    <!-- Watchlist actions -->
    {#if showActions && showWatchlist}
      <div class="absolute bottom-2 right-2 flex gap-2">
        {#if isInWatchlist}
          <!-- Remove from watchlist button -->
          <button
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleWatchlist(); }}
            class="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors opacity-90 hover:opacity-100"
            title="Remove from watchlist"
          >
            <Icon icon="heroicons:heart-solid" class="w-5 h-5" />
          </button>
        {:else}
          <!-- Add to watchlist button -->
          <button
            onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleWatchlist(); }}
            class="bg-gray-800 bg-opacity-70 hover:bg-green-600 text-white p-2 rounded-full transition-all opacity-90 hover:opacity-100"
            title="Add to watchlist"
          >
            <Icon icon="heroicons:heart" class="w-5 h-5" />
          </button>
        {/if}
      </div>
    {:else if isInWatchlist}
      <!-- Just the indicator when actions are disabled -->
      <div class="absolute bottom-2 right-2">
        <div class="bg-green-600 text-white p-1 rounded-full">
          <Icon icon="heroicons:heart-solid" class="w-4 h-4" />
        </div>
      </div>
    {/if}
    
  </div>
  
</a>