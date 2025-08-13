<!--
  Game details page with comprehensive information
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import PlatformIcons from '../../../components/PlatformIcons.svelte';
  import StatusBadge from '../../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import { formatDate, truncateText } from '$lib/utils.js';
  import { addToWatchlist, removeFromWatchlist } from '$lib/api.client.js';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  
  let { data } = $props();
  
  let game = $derived(data?.game);
  let user = $derived(data?.user);
  let isInWatchlist = $derived(data?.isInWatchlist || false);
  let loading = $state(false);
  
  if (!game) {
    goto('/search');
  }
  
  let showFullDescription = $state(false);
  let activeImageIndex = $state(0);
  let modalOpen = $state(false);
  let modalImageIndex = $state(0);
  let dialog = $state(); // HTMLDialogElement
  
  let images = $derived([
    ...(game?.cover_url ? [game.cover_url] : []),
    ...(game?.screenshots || [])
  ]);
  
  let truncatedSummary = $derived(game?.summary ? truncateText(game.summary, 300) : '');
  let showExpandButton = $derived(game?.summary && game.summary.length > 300);
  
  function handleBack() {
    if (browser) {
      // Check for referrer in URL params or session storage
      const referrer = $page.url.searchParams.get('from') 
        || sessionStorage.getItem('gameDetailReferrer') 
        || '/search';
      
      // Clean up the referrer from session storage
      sessionStorage.removeItem('gameDetailReferrer');
      
      // Use SvelteKit's goto instead of window.history.back()
      goto(referrer);
    } else {
      // Not in browser, fallback to search
      goto('/search');
    }
  }
  
  async function toggleWatchlist() {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
    
    loading = true;
    try {
      const gameData = {
        title: game.title,
        cover_url: game.cover_url,
        platforms: game.platforms,
        igdb_id: game.igdb_id
      };
      
      let result;
      if (isInWatchlist) {
        result = await removeFromWatchlist(game.igdb_id);
      } else {
        result = await addToWatchlist(game.igdb_id, gameData);
      }
      
      if (result.success) {
        isInWatchlist = !isInWatchlist;
      } else {
        throw new Error(result.error || 'Failed to update watchlist');
      }
    } catch (error) {
      console.error('Watchlist error:', error);
      alert('Failed to update watchlist. Please try again.');
    } finally {
      loading = false;
    }
  }
  
  function handleRequest() {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
    goto(`/request?game=${game.igdb_id}`);
  }
  
  function changeImage(index) {
    activeImageIndex = index;
  }
  
  function nextImage() {
    activeImageIndex = (activeImageIndex + 1) % images.length;
  }
  
  function prevImage() {
    activeImageIndex = (activeImageIndex - 1 + images.length) % images.length;
  }
  
  function toggleDescription() {
    showFullDescription = !showFullDescription;
  }
  
  function openImageModal(index) {
    modalImageIndex = index;
    modalOpen = true;
  }
  
  function closeImageModal() {
    if (dialog) {
      dialog.close();
    }
  }
  
  // Effect to show/hide dialog
  $effect(() => {
    if (modalOpen && dialog) {
      dialog.showModal();
    }
  });
  
  function nextModalImage() {
    modalImageIndex = (modalImageIndex + 1) % images.length;
  }
  
  function prevModalImage() {
    modalImageIndex = (modalImageIndex - 1 + images.length) % images.length;
  }
  
  function handleModalKeydown(event) {
    if (event.key === 'Escape') {
      closeImageModal();
    } else if (event.key === 'ArrowLeft' && images.length > 1) {
      prevModalImage();
    } else if (event.key === 'ArrowRight' && images.length > 1) {
      nextModalImage();
    }
  }
  
  // Immediately scroll to top when page loads to prevent inherited scroll position
  onMount(() => {
    if (browser) {
      // Force immediate scroll to top without animation
      window.scrollTo(0, 0);
    }
  });
</script>

<svelte:head>
  <title>{game?.title || 'Game Details'} - GameRequest</title>
  <meta name="description" content={truncatedSummary || 'View detailed information about this game.'} />
</svelte:head>

{#if game}
  <!-- Blurred background -->
  <div class="fixed inset-0 z-0 overflow-hidden">
    {#if game.cover_url}
      <img
        src={game.cover_url}
        alt="{game.title} background"
        class="w-full h-full object-cover filter blur-3xl scale-110 opacity-20"
      />
    {/if}
    <!-- Gradient overlay -->
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-gray-900/80 to-gray-900"></div>
  </div>
  
  <!-- Main content -->
  <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Back Button -->
    <button
      onclick={handleBack}
      class="back-button-enhanced flex items-center gap-3 mb-6 group overflow-hidden relative"
    >
      <svg class="w-5 h-5 transition-transform group-hover:-translate-x-1 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
      <span class="text-sm font-medium relative z-10">Back</span>
      <!-- Shine effect overlay -->
      <div class="shine-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </button>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Left Column - Game Images -->
      <div class="lg:col-span-1">
        <!-- Main Image -->
        <div class="relative aspect-[3/4] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-4">
          {#if images.length > 0}
            <img
              src={images[activeImageIndex]}
              alt="{game.title} screenshot {activeImageIndex + 1}"
              class="w-full h-full object-cover cursor-pointer"
              loading="lazy"
              onclick={() => openImageModal(activeImageIndex)}
            />
            
            {#if images.length > 1}
              <!-- Image Navigation -->
              <button
                type="button"
                onclick={prevImage}
                class="rotator-btn rotator-btn-left"
                aria-label="Previous image"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              
              <button
                type="button"
                onclick={nextImage}
                class="rotator-btn rotator-btn-right"
                aria-label="Next image"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
              
              <!-- Image Counter -->
              <div class="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                {activeImageIndex + 1} / {images.length}
              </div>
            {/if}
          {:else}
            <div class="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              <svg class="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
              </svg>
            </div>
          {/if}
        </div>
        
        <!-- Thumbnail Gallery -->
        {#if images.length > 1}
          <div class="grid grid-cols-4 gap-2">
            {#each images as image, index}
              <button
                type="button"
                onclick={() => changeImage(index)}
                ondblclick={() => openImageModal(index)}
                class="aspect-[3/4] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden border-2 transition-colors cursor-pointer"
                class:border-blue-500={index === activeImageIndex}
                class:border-transparent={index !== activeImageIndex}
                title="Click to preview, double-click to open fullscreen"
              >
                <img
                  src={image}
                  alt="{game.title} thumbnail {index + 1}"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Right Column - Game Information -->
      <div class="lg:col-span-2">
        <!-- Game Header -->
        <div class="mb-6">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {game.title}
              </h1>
              
              <!-- Platforms -->
              {#if game.platforms && game.platforms.length > 0}
                <div class="mb-3">
                  <PlatformIcons platforms={game.platforms} {game} size="xl" maxVisible={8} />
                </div>
              {/if}
              
              <!-- Genres -->
              {#if game.genres && game.genres.length > 0}
                <div class="flex flex-wrap gap-2 mb-3">
                  {#each game.genres as genre}
                    <span class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-sm">
                      {genre}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
            
            <!-- Status and Rating -->
            <div class="ml-4 text-right">
              {#if game.status}
                <div class="mb-2">
                  <StatusBadge status={game.status} />
                </div>
              {/if}
              
              {#if game.rating}
                <div class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-medium hidden sm:block">
                  {Math.round(game.rating)}/100
                </div>
              {/if}
            </div>
          </div>
          
          <!-- Release Date and Company -->
          <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            {#if game.release_date}
              <div>
                <span class="font-medium">Released:</span> {formatDate(game.release_date)}
              </div>
            {/if}
            
            {#if game.companies && game.companies.length > 0}
              <div>
                <span class="font-medium">Developer:</span> {game.companies.join(', ')}
              </div>
            {/if}
            
            {#if game.game_modes && game.game_modes.length > 0}
              <div>
                <span class="font-medium">Game Modes:</span> {game.game_modes.join(', ')}
              </div>
            {/if}
            
            <!-- Mobile Rating -->
            {#if game.rating}
              <div class="sm:hidden">
                <span class="font-medium">Rating:</span> 
                <span class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded-full text-xs font-medium ml-1">
                  {Math.round(game.rating)}/100
                </span>
              </div>
            {/if}
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex flex-wrap gap-3 mb-6">
          {#if user}
            <!-- Only show request button for games NOT in ROMM -->
            {#if !game.is_romm_game && !game.is_in_romm}
              <button
                type="button"
                onclick={handleRequest}
                class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Request This Game
              </button>
            {/if}
            
            <button
              type="button"
              onclick={toggleWatchlist}
              disabled={loading}
              class="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              class:bg-green-100={isInWatchlist}
              class:hover:bg-green-200={isInWatchlist}
              class:text-green-700={isInWatchlist}
            >
              {#if loading}
                <LoadingSpinner size="sm" />
              {:else}
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  {#if isInWatchlist}
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  {:else}
                    <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zM12.1 18.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>
                  {/if}
                </svg>
              {/if}
              <span>
                {isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </span>
            </button>
            
            <a
              href="https://www.igdb.com/games/{game.slug}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              <span>More on IGDB</span>
            </a>
            
            <!-- ROMM Server Buttons -->
            {#if game.is_romm_game || game.is_in_romm}
              <a
                href="{game.romm_url}"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12l4-4m-4 4l4 4"/>
                </svg>
                <span>See on Game Server</span>
              </a>
              
              {#if game.romm_url}
                <a
                  href="{game.romm_url}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span>Play on Server</span>
                </a>
              {/if}
            {/if}
          {:else}
            <!-- Only show login to request button for games NOT in ROMM -->
            {#if !game.is_romm_game && !game.is_in_romm}
              <a
                href="/api/auth/login"
                class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Login to Request
              </a>
            {/if}
            
            <a
              href="https://www.igdb.com/games/{game.slug}"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
              <span>More on IGDB</span>
            </a>
            
            <!-- ROMM Server Buttons -->
            {#if game.is_romm_game || game.is_in_romm}
              <a
                href="{game.romm_url}"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12l4-4m-4 4l4 4"/>
                </svg>
                <span>See on Game Server</span>
              </a>
              
              {#if game.romm_url}
                <a
                  href="{game.romm_url}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span>Play on Server</span>
                </a>
              {/if}
            {/if}
          {/if}
        </div>
        
        <!-- Game Description -->
        {#if game.summary}
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              About This Game
            </h2>
            
            <div class="prose prose-sm dark:prose-invert max-w-none">
              <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
                {showFullDescription || !showExpandButton ? game.summary : truncatedSummary}
              </p>
              
              {#if showExpandButton}
                <button
                  type="button"
                  onclick={toggleDescription}
                  class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium mt-2"
                >
                  {showFullDescription ? 'Show less' : 'Show more'}
                </button>
              {/if}
            </div>
          </div>
        {/if}
        
        <!-- Game Statistics -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {#if game.popularity}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round(game.popularity)}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Popularity
              </div>
            </div>
          {/if}
          
          {#if game.rating}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">
                {Math.round(game.rating)}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Rating
              </div>
            </div>
          {/if}
          
          {#if game.platforms}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {game.platforms.length}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Platforms
              </div>
            </div>
          {/if}
          
          {#if game.genres}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {game.genres.length}
              </div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Genres
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Videos (if available) -->
        {#if game.videos && game.videos.length > 0}
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Videos
            </h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {#each game.videos.slice(0, 4) as videoId}
                <div class="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <iframe
                    src="https://www.youtube.com/embed/{videoId}"
                    title="Game trailer"
                    class="w-full h-full"
                    frameborder="0"
                    allowfullscreen
                    loading="lazy"
                  ></iframe>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <!-- Loading or error state -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="text-center py-12">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Game not found
      </h3>
      <p class="text-gray-500 dark:text-gray-400 mb-4">
        The game you're looking for doesn't exist or has been removed.
      </p>
      <button
        type="button"
        onclick={() => goto('/search')}
        class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Navigate to Search"
      >
        Browse Games
      </button>
    </div>
  </div>
{/if}

<!-- Image Modal -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  onclose={() => (modalOpen = false)}
  onclick={(e) => { if (e.target === dialog) dialog.close(); }}
  onkeydown={handleModalKeydown}
  class="image-modal"
>
  {#if images.length > 0}
    <div class="modal-content">
      <!-- Close button -->
      <button
        onclick={closeImageModal}
        class="close-btn"
        aria-label="Close modal"
        autofocus
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
      
      <!-- Main modal image -->
      <div class="image-container">
        <img
          src={images[modalImageIndex]}
          alt="{game.title} screenshot {modalImageIndex + 1}"
          class="modal-image"
        />
        
        <!-- Navigation arrows -->
        {#if images.length > 1}
          <button
            onclick={prevModalImage}
            class="nav-btn nav-btn-left"
            aria-label="Previous image"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          
          <button
            onclick={nextModalImage}
            class="nav-btn nav-btn-right"
            aria-label="Next image"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          
          <!-- Image counter -->
          <div class="image-counter">
            {modalImageIndex + 1} / {images.length}
          </div>
        {/if}
      </div>
      
      <!-- Thumbnail strip -->
      {#if images.length > 1}
        <div class="thumbnail-strip">
          <div class="thumbnail-container">
            {#each images as image, index}
              <button
                onclick={() => modalImageIndex = index}
                class="thumbnail"
                class:active={index === modalImageIndex}
              >
                <img
                  src={image}
                  alt="{game.title} thumbnail {index + 1}"
                  class="thumbnail-image"
                />
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  /* Dialog styles */
  .image-modal {
    min-width: 50vw;
    min-height: 50vh;
    max-width: 95vw;
    max-height: 95vh;
    border-radius: 0.5rem;
    border: none;
    padding: 0;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(8px);
    margin: auto;
  }
  
  .image-modal::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }
  
  .image-modal[open] {
    animation: modal-zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .image-modal[open]::backdrop {
    animation: modal-fade 0.2s ease-out;
  }
  
  @keyframes modal-zoom {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  
  @keyframes modal-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  .modal-content {
    position: relative;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    height: 100%;
  }
  
  .close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    padding: 0.5rem;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(4px);
  }
  
  .close-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.1);
  }
  
  .image-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
  }
  
  .modal-image {
    max-width: 100%;
    max-height: 60vh;
    min-height: 30vh;
    object-fit: contain;
    border-radius: 0.25rem;
  }
  
  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    padding: 1rem;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(4px);
  }
  
  .nav-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: translateY(-50%) scale(1.1);
  }
  
  .nav-btn-left {
    left: 1rem;
  }
  
  .nav-btn-right {
    right: 1rem;
  }
  
  .image-counter {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    backdrop-filter: blur(4px);
  }
  
  .thumbnail-strip {
    margin-top: 1rem;
    width: 100%;
    display: flex;
    justify-content: center;
  }
  
  .thumbnail-container {
    display: flex;
    gap: 0.5rem;
    max-width: 100%;
    overflow-x: auto;
    padding: 0.5rem;
    scrollbar-width: thin;
  }
  
  .thumbnail {
    flex-shrink: 0;
    width: 4rem;
    height: 3rem;
    border-radius: 0.25rem;
    overflow: hidden;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    background: none;
    padding: 0;
  }
  
  .thumbnail:hover {
    transform: scale(1.05);
    border-color: rgba(59, 130, 246, 0.5);
  }
  
  .thumbnail.active {
    border-color: #3b82f6;
  }
  
  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  /* Hide scrollbar for webkit browsers */
  .thumbnail-container::-webkit-scrollbar {
    height: 4px;
  }
  
  .thumbnail-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .thumbnail-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
  
  .thumbnail-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
  
  /* Rotator button styles */
  .rotator-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    padding: 0.75rem;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(4px);
    opacity: 0.8;
  }
  
  .rotator-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: translateY(-50%) scale(1.1);
    opacity: 1;
  }
  
  .rotator-btn-left {
    left: 0.75rem;
  }
  
  .rotator-btn-right {
    right: 0.75rem;
  }
</style>