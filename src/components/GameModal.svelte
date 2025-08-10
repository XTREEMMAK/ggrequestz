<!--
  SvelteKit Modal for displaying game details with screenshots
-->

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { browser } from '$app/environment';
  import StatusBadge from './StatusBadge.svelte';
  import { formatDate, truncateText } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { game = null, isOpen = false } = $props();
  
  const dispatch = createEventDispatcher();
  
  let modalElement = $state(null);
  let activeImageIndex = $state(0);
  let imageError = $state(false);
  
  // Combine cover and screenshots for carousel
  let images = $derived([
    ...(game?.cover_url && !imageError ? [game.cover_url] : []),
    ...(game?.screenshots || [])
  ]);
  
  let truncatedSummary = $derived(game?.summary ? truncateText(game.summary, 200) : '');
  let releaseDate = $derived(game?.release_date ? formatDate(game.release_date) : null);
  let gameStatus = $derived(getGameStatus(game));
  
  function getGameStatus(game) {
    if (!game) return 'available';
    if (game.status) return game.status;
    if (game.popularity > 80) return 'popular';
    if (game.release_date && Date.now() - new Date(game.release_date).getTime() < 30 * 24 * 60 * 60 * 1000) {
      return 'new';
    }
    return 'available';
  }
  
  function closeModal() {
    dispatch('close');
  }
  
  function handleBackdropClick(event) {
    if (event.target === modalElement) {
      closeModal();
    }
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeModal();
    } else if (event.key === 'ArrowLeft' && images.length > 1) {
      prevImage();
    } else if (event.key === 'ArrowRight' && images.length > 1) {
      nextImage();
    }
  }
  
  function nextImage() {
    if (images.length > 1) {
      activeImageIndex = (activeImageIndex + 1) % images.length;
    }
  }
  
  function prevImage() {
    if (images.length > 1) {
      activeImageIndex = (activeImageIndex - 1 + images.length) % images.length;
    }
  }
  
  function changeImage(index) {
    activeImageIndex = index;
  }
  
  function handleImageError() {
    imageError = true;
  }
  
  function handleRequest() {
    dispatch('request', { game });
  }
  
  function handleWatchlist() {
    dispatch('watchlist', { game });
  }
  
  function handleViewDetails() {
    dispatch('view-details', { game });
  }
  
  // Handle modal focus and scroll lock
  $effect(() => {
    if (browser && isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Focus the modal
      if (modalElement) {
        modalElement.focus();
      }
      
      return () => {
        document.body.style.overflow = '';
      };
    }
  });
  
  // Reset image index when game changes
  $effect(() => {
    if (game) {
      activeImageIndex = 0;
      imageError = false;
    }
  });
</script>

{#if isOpen && game}
  <!-- Modal backdrop -->
  <div
    bind:this={modalElement}
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background-color: var(--overlay);"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    tabindex="0"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 150 }}
  >
    <!-- Modal content -->
    <div
      class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      in:scale={{ duration: 200, easing: quintOut, start: 0.95 }}
      out:scale={{ duration: 150, easing: quintOut, start: 0.95 }}
    >
      <!-- Close button -->
      <button
        onclick={closeModal}
        class="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
        aria-label="Close modal"
      >
        <Icon icon="heroicons:x-mark" class="w-5 h-5" />
      </button>
      
      <!-- Modal body -->
      <div class="grid grid-cols-1 lg:grid-cols-2 max-h-[90vh]">
        <!-- Left side - Image carousel -->
        <div class="relative bg-gray-100 dark:bg-gray-700">
          {#if images.length > 0}
            <div class="aspect-[4/3] lg:aspect-auto lg:h-full relative">
              <img
                src={images[activeImageIndex]}
                alt="{game.title} screenshot {activeImageIndex + 1}"
                class="w-full h-full object-cover"
                onerror={handleImageError}
              />
              
              <!-- Image navigation arrows -->
              {#if images.length > 1}
                <button
                  onclick={prevImage}
                  class="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70 transition-all"
                  aria-label="Previous image"
                >
                  <Icon icon="heroicons:chevron-left" class="w-5 h-5" />
                </button>
                
                <button
                  onclick={nextImage}
                  class="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70 transition-all"
                  aria-label="Next image"
                >
                  <Icon icon="heroicons:chevron-right" class="w-5 h-5" />
                </button>
                
                <!-- Image counter -->
                <div class="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                  {activeImageIndex + 1} / {images.length}
                </div>
              {/if}
              
              <!-- Status badge -->
              <div class="absolute top-4 left-4">
                <StatusBadge status={gameStatus} size="sm" />
              </div>
            </div>
            
            <!-- Thumbnail strip -->
            {#if images.length > 1}
              <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-4">
                <div class="flex gap-2 overflow-x-auto">
                  {#each images as image, index}
                    <button
                      onclick={() => changeImage(index)}
                      class="flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-colors"
                      class:border-blue-500={index === activeImageIndex}
                      class:border-gray-600={index !== activeImageIndex}
                    >
                      <img
                        src={image}
                        alt="{game.title} thumbnail {index + 1}"
                        class="w-full h-full object-cover"
                      />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div class="aspect-[4/3] lg:aspect-auto lg:h-full flex items-center justify-center text-gray-400">
              <Icon icon="heroicons:photo" class="w-24 h-24" />
            </div>
          {/if}
        </div>
        
        <!-- Right side - Game information -->
        <div class="p-6 overflow-y-auto max-h-[90vh] lg:max-h-full">
          <!-- Game title -->
          <h2 id="modal-title" class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {game.title}
          </h2>
          
          <!-- Release date -->
          {#if releaseDate}
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              Released: {releaseDate}
            </p>
          {/if}
          
          <!-- Rating -->
          {#if game.rating}
            <div class="flex items-center mb-4">
              <div class="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold mr-3">
                {Math.round(game.rating)}%
              </div>
              <span class="text-gray-600 dark:text-gray-400 text-sm">User Rating</span>
            </div>
          {/if}
          
          <!-- Platforms -->
          {#if game.platforms && game.platforms.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Platforms:</h3>
              <div class="flex flex-wrap gap-2">
                {#each game.platforms as platform}
                  <span class="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-xs">
                    {platform}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Genres -->
          {#if game.genres && game.genres.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Genres:</h3>
              <div class="flex flex-wrap gap-2">
                {#each game.genres as genre}
                  <span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs">
                    {genre}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Summary -->
          {#if game.summary}
            <div class="mb-6">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Summary:</h3>
              <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {truncatedSummary}
                {#if game.summary.length > 200}
                  <button
                    onclick={handleViewDetails}
                    class="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                  >
                    Read more
                  </button>
                {/if}
              </p>
            </div>
          {/if}
          
          <!-- Library status -->
          {#if game.is_romm_game}
            <div class="mb-4 p-3 bg-green-50 dark:bg-green-900 rounded-lg border border-green-200 dark:border-green-700">
              <div class="flex items-center">
                <div class="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
                <span class="text-green-800 dark:text-green-200 text-sm font-medium">Available in Library</span>
              </div>
            </div>
          {:else if game.is_in_romm}
            <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
              <div class="flex items-center">
                <div class="w-3 h-3 bg-blue-400 rounded-full mr-2"></div>
                <span class="text-blue-800 dark:text-blue-200 text-sm font-medium">In Library</span>
              </div>
            </div>
          {/if}
          
          <!-- Action buttons -->
          <div class="flex flex-wrap gap-3">
            {#if game.is_romm_game}
              <a
                href="{game.romm_url}"
                target="_blank"
                class="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                <Icon icon="heroicons:server" class="w-4 h-4 mr-2" />
                See on Game Server
              </a>
              
              <a
                href={game.romm_url}
                target="_blank"
                class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                <Icon icon="heroicons:play" class="w-4 h-4 mr-2" />
                Play on Server
              </a>
            {:else if game.is_in_romm}
              <a
                href="{game.romm_url}"
                target="_blank"
                class="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                <Icon icon="heroicons:server" class="w-4 h-4 mr-2" />
                See on Game Server
              </a>
              
              <a
                href={game.romm_url}
                target="_blank"
                class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                <Icon icon="heroicons:play" class="w-4 h-4 mr-2" />
                Play on Server
              </a>
            {:else if !game.is_romm_game && !game.is_in_romm}
              <button
                onclick={handleRequest}
                class="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                <Icon icon="heroicons:plus" class="w-4 h-4 mr-2" />
                Request
              </button>
            {/if}
            
            <button
              onclick={handleWatchlist}
              class="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
            >
              <Icon icon="heroicons:heart" class="w-4 h-4 mr-2" />
              Watchlist
            </button>
            
            <button
              onclick={handleViewDetails}
              class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
            >
              <Icon icon="heroicons:information-circle" class="w-4 h-4 mr-2" />
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}