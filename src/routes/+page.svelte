<!--
  Overseerr-style game discovery dashboard
-->

<script>
  import GameCard from '../components/GameCard.svelte';
  import GameModal from '../components/GameModal.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import SEOHead from '../components/SEOHead.svelte';
  import { goto } from '$app/navigation';
  import { slide, fade, scale } from 'svelte/transition';
  import { quintOut, backOut } from 'svelte/easing';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { addToWatchlist, removeFromWatchlist } from '$lib/api.client.js';
  import { createHoverPreloader } from '$lib/utils.js';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let newInLibrary = $state(data?.newInLibrary || []);
  let newReleases = $state(data?.newReleases || []);
  let popularGames = $state(data?.popularGames || []);
  let recentRequests = $derived(data?.recentRequests || []);
  let userWatchlist = $state(data?.userWatchlist || []);
  let rommAvailable = $derived(data?.rommAvailable || false);
  let genres = $state(data?.genres || []);
  let publishers = $state(data?.publishers || []);
  let systems = $state(data?.systems || []);
  
  // Loading states for Load More functionality
  let loadingNewInLibrary = $state(false);
  let loadingROMMs = $state(false);
  let loadingNewReleases = $state(false);
  let loadingPopular = $state(false);

  // Helper function to check if game is in watchlist
  function isGameInWatchlist(game) {
    const gameId = game.igdb_id || game.id;
    return userWatchlist.some(w => w.igdb_id === gameId);
  }
  
  // Pagination tracking
  let newInLibraryPage = $state(1);
  let rommsPage = $state(1);
  let newReleasesPage = $state(1);
  let popularPage = $state(1);
  
  // Section expansion states - start in vertical grid view
  let newInLibraryExpanded = $state(true);
  let rommsExpanded = $state(true);
  let newReleasesExpanded = $state(true);
  let popularExpanded = $state(true);
  
  // Scroll to top button state
  let showScrollToTop = $state(false);
  
  // State restoration flag to skip animations
  let isRestoringState = $state(false);
  let skipAnimations = $state(false);
  
  // Navigation and scroll management
  let savedScrollPosition = $state(0);
  
  // Modal state
  let modalOpen = $state(false);
  let modalGame = $state(null);
  
  const ITEMS_PER_PAGE = 16;
  let loading = $derived(data?.loading || false);


  // Helper function for staggered card loading animation
  async function addGamesWithStagger(games, existingGames, updateFunction) {
    const STAGGER_DELAY = 150; // ms between each card
    let currentGames = [...existingGames];
    
    for (let i = 0; i < games.length; i++) {
      // Add one new game at a time to the existing array
      currentGames = [...currentGames, games[i]];
      updateFunction(currentGames);
      
      // Wait before adding next card (except for the last one)
      if (i < games.length - 1) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
      }
    }
  }
  
  // Simple state management
  
  function saveHomepageState() {
    if (!browser) return;
    
    const state = {
      newInLibrary,
      newReleases,
      popularGames,
      newInLibraryPage,
      rommsPage,
      newReleasesPage,
      popularPage,
      newInLibraryExpanded,
      rommsExpanded,
      newReleasesExpanded,
      popularExpanded
    };
    
    // Save state without scroll position
    sessionStorage.setItem('homepage_content_state', JSON.stringify(state));
  }
  
  function saveScrollPosition() {
    if (!browser) return;
    savedScrollPosition = window.scrollY;
    sessionStorage.setItem('homepage_scroll_position', savedScrollPosition.toString());
  }
  
  function restoreScrollPosition() {
    if (!browser) return;
    
    const savedScroll = sessionStorage.getItem('homepage_scroll_position');
    if (savedScroll) {
      const scrollY = parseInt(savedScroll, 10);
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        // Clear the saved scroll position after restoring
        sessionStorage.removeItem('homepage_scroll_position');
      });
    }
  }
  
  function restoreHomepageState() {
    if (!browser) return;
    
    const savedState = sessionStorage.getItem('homepage_content_state');
    if (!savedState) return;
    
    try {
      const data = JSON.parse(savedState);
      
      // Set flag to skip animations during restoration
      skipAnimations = true;
      
      // Restore games data if we have more content than initially loaded
      if (data.newInLibrary && data.newInLibrary.length > newInLibrary.length) {
        newInLibrary = data.newInLibrary;
        newInLibraryPage = data.newInLibraryPage || 1;
      }
      if (data.newReleases && data.newReleases.length > newReleases.length) {
        newReleases = data.newReleases;
        newReleasesPage = data.newReleasesPage || 1;
      }
      if (data.popularGames && data.popularGames.length > popularGames.length) {
        popularGames = data.popularGames;
        popularPage = data.popularPage || 1;
      }
      
      // Restore expansion states
      if (data.newInLibraryExpanded !== undefined) newInLibraryExpanded = data.newInLibraryExpanded;
      if (data.rommsExpanded !== undefined) rommsExpanded = data.rommsExpanded;
      if (data.newReleasesExpanded !== undefined) newReleasesExpanded = data.newReleasesExpanded;
      if (data.popularExpanded !== undefined) popularExpanded = data.popularExpanded;
      
      // Re-enable animations after a brief delay
      setTimeout(() => {
        skipAnimations = false;
      }, 300);
      
    } catch (error) {
      console.error('Failed to restore homepage state:', error);
    }
  }
  
  
  // References for horizontal scrolling
  let newInLibraryScroll = $state();
  let rommsScroll = $state();
  let newReleasesScroll = $state();
  let popularScroll = $state();
  
  function scrollHorizontally(element, direction) {
    if (element) {
      const scrollAmount = 240; // Width of card + gap
      element.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }
  
  function handleGameRequest({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
    goto(`/request?game=${detail.game.igdb_id || detail.game.id}`);
  }
  
  async function handleWatchlist({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }

    const game = detail.game;
    const gameId = game.igdb_id || game.id;
    const isCurrentlyInWatchlist = userWatchlist.some(w => w.igdb_id === gameId);

    try {
      if (isCurrentlyInWatchlist) {
        // Remove from watchlist
        const result = await removeFromWatchlist(gameId);
        if (result.success) {
          userWatchlist = userWatchlist.filter(w => w.igdb_id !== gameId);
        } else {
          throw new Error(result.error || 'Failed to remove from watchlist');
        }
      } else {
        // Add to watchlist
        const gameData = {
          title: game.title,
          cover_url: game.cover_url,
          platforms: game.platforms,
          genres: game.genres,
          rating: game.rating,
          release_date: game.release_date
        };
        
        const result = await addToWatchlist(gameId, gameData);
        if (result.success) {
          userWatchlist = [...userWatchlist, { ...gameData, igdb_id: gameId }];
        } else {
          throw new Error(result.error || 'Failed to add to watchlist');
        }
      }
    } catch (error) {
      console.error('Watchlist error:', error);
      alert('Failed to update watchlist. Please try again.');
    }
  }
  
  
  function handleShowModal({ detail }) {
    modalGame = detail.game;
    modalOpen = true;
  }
  
  function handleCloseModal() {
    modalOpen = false;
    modalGame = null;
  }
  
  function handleModalRequest({ detail }) {
    // Close modal and redirect to request page
    handleCloseModal();
    goto(`/request?game=${detail.game.igdb_id}`);
  }
  
  function handleModalWatchlist({ detail }) {
    // Delegate to existing watchlist handler
    handleWatchlist({ detail });
  }
  
  function handleModalViewDetails({ detail }) {
    // Close modal and redirect to details page
    handleCloseModal();
    goto(`/game/${detail.game.igdb_id || detail.game.id}`);
  }
  
  async function loadMoreNewInLibrary() {
    if (loadingNewInLibrary || !rommAvailable) return;
    
    loadingNewInLibrary = true;
    try {
      const response = await fetch(`/api/romm/recent?page=${newInLibraryPage + 1}&limit=${ITEMS_PER_PAGE}`);
      if (response.ok) {
        const data = await response.json();
        if (data.games && data.games.length > 0) {
          // Add games one by one with staggered animation
          await addGamesWithStagger(data.games, newInLibrary, (updatedGames) => {
            newInLibrary = updatedGames;
          });
          newInLibraryPage += 1;
        }
      }
    } catch (error) {
      console.error('Failed to load more library games:', error);
    } finally {
      loadingNewInLibrary = false;
    }
  }
  
  async function loadMoreROMs() {
    if (loadingROMMs || !rommAvailable) return;
    
    loadingROMMs = true;
    try {
      const response = await fetch(`/api/romm/recent?page=${rommsPage + 1}&limit=${ITEMS_PER_PAGE}`);
      if (response.ok) {
        const data = await response.json();
        if (data.games && data.games.length > 0) {
          // Add games one by one with staggered animation
          await addGamesWithStagger(data.games, newInLibrary, (updatedGames) => {
            newInLibrary = updatedGames;
          });
          rommsPage += 1;
        }
      }
    } catch (error) {
      console.error('Failed to load more ROMs:', error);
    } finally {
      loadingROMMs = false;
    }
  }
  
  async function loadMoreNewReleases() {
    if (loadingNewReleases) return;
    
    loadingNewReleases = true;
    try {
      // Try to use preloaded data first
      let data = newReleasesPreloader.getCached();
      
      if (!data) {
        // Fallback to manual fetch if no preloaded data
        const response = await fetch(`/api/games/recent?page=${newReleasesPage + 1}&limit=${ITEMS_PER_PAGE}`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      if (data?.games && data.games.length > 0) {
        // Add games one by one with staggered animation
        await addGamesWithStagger(data.games, newReleases, (updatedGames) => {
          newReleases = updatedGames;
        });
        newReleasesPage += 1;
      }
    } catch (error) {
      console.error('Failed to load more new releases:', error);
    } finally {
      loadingNewReleases = false;
    }
  }
  
  async function loadMorePopular() {
    if (loadingPopular) return;
    
    loadingPopular = true;
    try {
      // Try to use preloaded data first
      let data = popularGamesPreloader.getCached();
      
      if (!data) {
        // Fallback to manual fetch if no preloaded data
        const response = await fetch(`/api/games/popular?page=${popularPage + 1}&limit=${ITEMS_PER_PAGE}`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      if (data?.games && data.games.length > 0) {
        // Add games one by one with staggered animation
        await addGamesWithStagger(data.games, popularGames, (updatedGames) => {
          popularGames = updatedGames;
        });
        popularPage += 1;
      }
    } catch (error) {
      console.error('Failed to load more popular games:', error);
    } finally {
      loadingPopular = false;
    }
  }
  
  // Simplified navigation hooks - reduce interference with browser history
  beforeNavigate((navigation) => {
    if (!browser) return;
    
    // Only save state when leaving the homepage for a game detail page
    if (window.location.pathname === '/' && navigation.to?.url.pathname.startsWith('/game/')) {
      saveHomepageState();
      saveScrollPosition();
    }
  });
  
  afterNavigate((navigation) => {
    if (!browser) return;
    
    // Only restore when returning from a game detail page
    if (window.location.pathname === '/' && navigation.from?.url.pathname.startsWith('/game/')) {
      setTimeout(() => {
        restoreScrollPosition();
      }, 50); // Reduced timeout
    }
  });
  
  onDestroy(() => {
    // Component cleanup - minimal state management
    if (browser) {
      saveScrollPosition();
    }
  });
  
  onMount(() => {
    // Restore state when coming back to homepage
    const performance = window.performance?.getEntriesByType('navigation')[0];
    const isPageRefresh = performance?.type === 'reload';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    
    if (!isPageRefresh) {
      // Not a refresh, try to restore state
      // Give mobile devices extra time
      if (isMobile) {
        setTimeout(() => {
          restoreHomepageState();
        }, 100);
      } else {
        restoreHomepageState();
      }
    }
  });
  
  // Handle scroll to top button visibility and save scroll position periodically
  onMount(() => {
    if (browser) {
      const handleScroll = () => {
        // Show scroll to top button after scrolling down 300px
        showScrollToTop = window.scrollY > 300;
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  });
  
  // Scroll to top function with slow easing
  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
  
  // Create hover preloaders for Load More buttons
  const newReleasesPreloader = $derived(createHoverPreloader(
    () => fetch(`/api/games/recent?page=${newReleasesPage + 1}&limit=${ITEMS_PER_PAGE}`).then(r => r.json()),
    { delay: 200, cacheKey: `new-releases-${newReleasesPage + 1}` }
  ));
  
  const popularGamesPreloader = $derived(createHoverPreloader(
    () => fetch(`/api/games/popular?page=${popularPage + 1}&limit=${ITEMS_PER_PAGE}`).then(r => r.json()),
    { delay: 200, cacheKey: `popular-games-${popularPage + 1}` }
  ));
</script>

<SEOHead 
  title="Discover - GG Requestz"
  description="Discover new games, search our extensive library, and request your favorites. Your ultimate gaming companion."
  ogTitle="GG Requestz - Discover Amazing Games"
  ogDescription="Explore our extensive game library with powerful search and filtering. Request your favorite games and build your personal watchlist."
/>

<div class="px-8 py-6">
  
  <!-- Mobile Logo Section -->
  <div class="lg:hidden text-center mb-8">
    <h1 class="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
      GG Requestz
    </h1>
    <p class="text-gray-400 mt-2 text-lg">Discover & Request Amazing Games</p>
  </div>
  
  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" text="Loading games..." />
    </div>
  {:else}
    
    <!-- New in Library from ROMM -->
{#if rommAvailable && newInLibrary.length > 0}
  <section class="mb-10">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
      <div class="flex items-center gap-3">
        <h2 class="text-4xl font-bold text-white">New in Library</h2>
        <span class="text-xs bg-green-600 text-white px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">ROMM Library</span>
      </div>
      <div class="flex items-center gap-2 justify-center sm:justify-end">
        
        {#if !rommsExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(rommsScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(rommsScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if rommsExpanded}
      <!-- Expanded vertical grid layout -->
      <div 
        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 transition-all duration-500 ease-out"
        in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
      >
        {#each newInLibrary as game, index}
          <div 
            in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
          >
            <GameCard 
              {game} 
              {user}
              isInWatchlist={false}
              enablePreloading={true}
              on:request={handleGameRequest}
              on:watchlist={handleWatchlist}
              on:show-modal={handleShowModal}
            />
          </div>
        {/each}
      </div>
    {:else}
      <!-- Default horizontal scroll layout -->
      <div 
        class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[420px]" 
        bind:this={rommsScroll}
        in:slide={{ duration: 300, easing: quintOut }}
      >
        {#each newInLibrary as game, index}
          <div class="flex-shrink-0 w-48" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
            <GameCard 
              {game} 
              {user}
              isInWatchlist={false}
              enablePreloading={true}
              on:request={handleGameRequest}
              on:watchlist={handleWatchlist}
              on:show-modal={handleShowModal}
            />
          </div>
        {/each}
      </div>
    {/if}

    
  </section>
{/if}

    <!-- New Releases from IGDB -->
    <section class="mb-10">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-4xl font-bold text-white">New Releases</h2>
        <!-- Desktop scroll arrows - hidden when expanded -->
        {#if !newReleasesExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(newReleasesScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(newReleasesScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
      
      {#if newReleases.length > 0}
        {#if newReleasesExpanded}
          <!-- Expanded vertical grid layout with smaller cards -->
          <div 
            class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 transition-all duration-500 ease-out"
            in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
          >
            {#each newReleases as game, index}
              <div 
                in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
              >
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {:else}
          <!-- Default horizontal scrolling layout -->
          <div 
            class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[400px]" 
            bind:this={newReleasesScroll}
            in:slide={{ duration: 300, easing: quintOut }}
          >
            {#each newReleases as game, index}
              <div class="flex-shrink-0 w-62" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Load More Button -->
        <div class="flex justify-center mt-6">
          <button
            class="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={loadMoreNewReleases}
            onmouseenter={() => newReleasesPreloader.preload()}
            onmouseleave={() => newReleasesPreloader.cancel()}
            disabled={loadingNewReleases}
          >
            {#if loadingNewReleases}
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Loading...
              </div>
            {:else}
              Load More
            {/if}
          </button>
        </div>
      {:else}
        <div class="text-center py-8 text-gray-400">
          <p>No new releases available</p>
        </div>
      {/if}
    </section>
    
    <!-- Popular Games -->
    <section class="mb-10">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-4xl font-bold text-white">Popular Games</h2>
        <!-- Desktop scroll arrows - hidden when expanded -->
        {#if !popularExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(popularScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(popularScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
      
      {#if popularGames.length > 0}
        {#if popularExpanded}
          <!-- Expanded vertical grid layout with smaller cards -->
          <div 
            class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 transition-all duration-500 ease-out"
            in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
          >
            {#each popularGames as game, index}
              <div 
                in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
              >
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {:else}
          <!-- Default horizontal scrolling layout -->
          <div 
            class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[420px]" 
            bind:this={popularScroll}
            in:slide={{ duration: 300, easing: quintOut }}
          >
            {#each popularGames as game, index}
              <div class="flex-shrink-0 w-48" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Load More Button -->
        <div class="flex justify-center mt-6">
          <button
            class="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={loadMorePopular}
            onmouseenter={() => popularGamesPreloader.preload()}
            onmouseleave={() => popularGamesPreloader.cancel()}
            disabled={loadingPopular}
          >
            {#if loadingPopular}
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Loading...
              </div>
            {:else}
              Load More
            {/if}
          </button>
        </div>
      {:else}
        <div class="text-center py-8 text-gray-400">
          <p>No popular games available</p>
        </div>
      {/if}
    </section>
    
    <!-- Genres Section -->
    {#if genres.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by Genre</h2>
          <a 
            href="/genres" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {#each genres.slice(0, 12) as genre}
            <a
              href="/genre/{encodeURIComponent(genre.name)}"
              class="bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg p-4 text-white hover:from-blue-700 hover:to-purple-800 transition-all duration-200 transform hover:scale-105"
            >
              <div class="text-center">
                <div class="text-lg font-semibold mb-1">{genre.name}</div>
                <div class="text-sm opacity-80">{genre.count} games</div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    <!-- Publishers Section -->
    {#if publishers.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by Publisher</h2>
          <a 
            href="/publishers" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {#each publishers.slice(0, 8) as publisher}
            <a
              href="/publisher/{encodeURIComponent(publisher.name)}"
              class="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all duration-200"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-white font-medium">{publisher.name}</div>
                  <div class="text-sm text-gray-400">{publisher.count} games</div>
                </div>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    <!-- Systems Section -->
    {#if systems.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by System</h2>
          <a 
            href="/systems" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {#each systems.slice(0, 12) as system}
            <a
              href="/system/{encodeURIComponent(system.name)}"
              class="bg-gradient-to-br from-green-600 to-teal-700 rounded-lg p-4 text-white hover:from-green-700 hover:to-teal-800 transition-all duration-200 transform hover:scale-105"
            >
              <div class="text-center">
                <div class="text-lg font-semibold mb-1">{system.name}</div>
                <div class="text-sm opacity-80">{system.count} games</div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    
    <!-- Recent Requests (Admin Only) -->
    {#if user && user.hasPermission && (user.hasPermission('admin.panel') || user.hasPermission('request.view_all')) && recentRequests.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Recent Requests</h2>
          <a 
            href="/admin" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Admin Panel
          </a>
        </div>
        
        <div class="space-y-3">
          {#each recentRequests.slice(0, 5) as request}
            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h3 class="font-medium text-white text-sm">
                    {request.title}
                  </h3>
                  <p class="text-xs text-gray-400 mt-1">
                    Requested by {request.user_name || 'Anonymous'} • {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div class="ml-4">
                  <StatusBadge status={request.status} />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<!-- Scroll to Top Button -->
{#if showScrollToTop}
  <button
    onclick={scrollToTop}
    class="fixed bottom-8 right-8 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 ease-out hover:scale-105"
    in:scale={{ duration: 200, start: 0.8 }}
    out:scale={{ duration: 200, start: 0.8 }}
    aria-label="Scroll to top"
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
    </svg>
  </button>
{/if}

<!-- Game Modal -->
<GameModal 
  game={modalGame}
  isOpen={modalOpen}
  on:close={handleCloseModal}
  on:request={handleModalRequest}
  on:watchlist={handleModalWatchlist}
  on:view-details={handleModalViewDetails}
/>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  .scrollbar-hide {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
</style>