<!--
  Overseerr-style poster card component for games
-->

<script>
  import { createEventDispatcher } from 'svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { truncateText, formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { game = {}, showActions = true, showWatchlist = true, isInWatchlist = false, user = null } = $props();
  
  const dispatch = createEventDispatcher();
  
  let truncatedTitle = $derived(truncateText(game.title || 'Unknown Game', 40));
  let releaseDate = $derived(game.release_date ? formatDate(game.release_date) : null);
  let gameStatus = $derived(getGameStatus(game));
  
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
  
  function handleViewDetails() {
    dispatch('view-details', { game });
  }
  
  function handleShowModal() {
    dispatch('show-modal', { game });
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
        const url = typeof screenshot === 'string' ? screenshot : 
                   screenshot?.url || screenshot?.image_id ? 
                   `https://images.igdb.com/igdb/image/upload/t_screenshot_med/${screenshot.image_id}.jpg` : 
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
  
  // Lazy loading intersection observer
  function lazyLoad(node) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.onload = () => handleImageLoad();
            img.removeAttribute('data-src');
          }
          observer.unobserve(entry.target);
        }
      });
    }, { 
      rootMargin: '50px',  // Start loading 50px before image enters viewport
      threshold: 0.1
    });
    
    observer.observe(node);
    
    return {
      destroy() {
        observer.disconnect();
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

<div 
  class="poster-card group relative rounded-xl overflow-hidden cursor-pointer aspect-[2/3] bg-gray-800 w-full"
  onclick={() => handleViewDetails()}
  onmouseenter={() => handleMouseEnter()}
  onmouseleave={() => handleMouseLeave()}
  onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? handleViewDetails() : null}
  aria-label="View details for {game.title || 'Unknown Game'}"
  role="button"
  tabindex="0"
>
  <!-- Poster Image with rotation -->
  <div class="relative w-full h-full overflow-hidden">
    {#if currentImage?.url && !imageError}
      <!-- Lazy loading placeholder -->
      <div class="relative w-full h-full">
        {#if !imageLoaded}
          <div class="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
            <Icon icon="heroicons:photo" class="w-12 h-12 text-gray-500" />
          </div>
        {/if}
        
        <img
          use:lazyLoad
          data-src={currentImage.url}
          alt="{game.title} {currentImage.type}"
          class="w-full h-full object-cover transition-opacity duration-300 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
          onerror={handleImageError}
          loading="lazy"
          decoding="async"
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
          onclick={(e) => { e.stopPropagation(); handleShowModal(); }}
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
    
    <!-- Watchlist indicator -->
    {#if isInWatchlist}
      <div class="absolute bottom-2 right-2">
        <div class="bg-green-600 text-white p-1 rounded-full">
          <Icon icon="heroicons:heart-solid" class="w-4 h-4" />
        </div>
      </div>
    {/if}
    
  </div>
  
</div>