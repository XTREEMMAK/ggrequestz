<!--
  Advanced search page with filters and results
-->

<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import GameCard from '../../components/GameCard.svelte';
  import SearchBar from '../../components/SearchBar.svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import { debounce } from '$lib/utils.js';
  import { igdbRequest } from '$lib/api.client.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let userWatchlist = $state(data?.userWatchlist || []);
  
  // Search state - using $state for reactivity
  let searchQuery = $state(data?.query || '');
  let searchResults = $state(data?.searchResults || { hits: [], found: 0 });
  let loading = $state(false);
  let searchError = $state('');
  let currentPage = $state(data?.initialFilters?.page || 1);
  let resultsPerPage = $state(20);
  
  // Filter state - using $state for reactivity
  let selectedPlatforms = $state(data?.initialFilters?.platforms || []);
  let selectedGenres = $state(data?.initialFilters?.genres || []);
  let sortBy = $state(data?.initialFilters?.sortBy || 'popularity:desc');
  let showFilters = $state(true);
  
  // Available filter options - using $state for reactivity
  let availablePlatforms = $state([]);
  let availableGenres = $state([]);
  
  // Search suggestions - using $state for reactivity
  let searchSuggestions = $state([]);
  let suggestionLoading = $state(false);
  
  let searchParams = $derived($page.url.searchParams);
  let queryFromUrl = $derived(searchParams.get('q') || '');
  let filterFromUrl = $derived(searchParams.get('filter') || '');
  
  // Initialize from URL on mount - only run once
  onMount(() => {
    // Restore all filters from URL parameters
    restoreFiltersFromUrl();

    // Extract available filters from results
    updateAvailableFilters();

    // Apply initial filter from URL
    if (filterFromUrl) {
      applyFilterFromUrl(filterFromUrl);
    }

    // Perform search if there are URL parameters
    if (queryFromUrl || selectedPlatforms.length > 0 || selectedGenres.length > 0) {
      performSearch();
    }
  });

  // Restore filters from URL parameters
  function restoreFiltersFromUrl() {
    const urlParams = $page.url.searchParams;

    // Restore platforms
    const platformsParam = urlParams.get('platforms');
    if (platformsParam) {
      selectedPlatforms = platformsParam.split(',').filter(Boolean);
    }

    // Restore genres
    const genresParam = urlParams.get('genres');
    if (genresParam) {
      selectedGenres = genresParam.split(',').filter(Boolean);
    }

    // Restore sort
    const sortParam = urlParams.get('sort');
    if (sortParam) {
      sortBy = sortParam;
    }

    // Restore page
    const pageParam = urlParams.get('page');
    if (pageParam) {
      currentPage = parseInt(pageParam) || 1;
    }

    // Restore search query
    const queryParam = urlParams.get('q');
    if (queryParam) {
      searchQuery = queryParam;
    }
  }
  
  // Debounced search is now handled by SearchBar component events
  
  function applyFilterFromUrl(filter) {
    switch (filter) {
      case 'recent':
        sortBy = 'release_date:desc';
        break;
      case 'popular':
        sortBy = 'popularity:desc';
        break;
      case 'rating':
        sortBy = 'rating:desc';
        break;
    }
  }
  
  function updateAvailableFilters() {
    if (searchResults.hits && searchResults.hits.length > 0) {
      // Extract platforms and genres from IGDB search results
      const platformCounts = {};
      const genreCounts = {};

      searchResults.hits.forEach(hit => {
        const game = hit.document;

        // Count platforms
        if (game.platforms && Array.isArray(game.platforms)) {
          game.platforms.forEach(platform => {
            if (platform && typeof platform === 'string') {
              platformCounts[platform] = (platformCounts[platform] || 0) + 1;
            }
          });
        }

        // Count genres
        if (game.genres && Array.isArray(game.genres)) {
          game.genres.forEach(genre => {
            if (genre && typeof genre === 'string') {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
          });
        }
      });

      // Convert to format expected by template (sorted by count, then name)
      availablePlatforms = Object.entries(platformCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

      availableGenres = Object.entries(genreCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    } else {
      // No results, clear filters
      availablePlatforms = [];
      availableGenres = [];
    }
  }
  
  async function performSearch() {
    if (!searchQuery.trim() && selectedPlatforms.length === 0 && selectedGenres.length === 0) {
      searchResults = { hits: [], found: 0 };
      return;
    }
    
    loading = true;
    searchError = '';
    
    try {
      const data = await igdbRequest('search', {
        q: searchQuery.trim(),
        limit: resultsPerPage,
        offset: (currentPage - 1) * resultsPerPage
      });
      
      if (data.success) {
        // Format IGDB response to match expected structure
        let allGames = data.data.map(game => ({
          document: {
            id: game.igdb_id,
            igdb_id: game.igdb_id,
            title: game.title,
            cover_url: game.cover_url,
            rating: game.rating,
            release_date: game.release_date,
            platforms: game.platforms || [],
            genres: game.genres || [],
            summary: game.summary
          }
        }));

        // Apply client-side filtering for platforms and genres
        let filteredGames = allGames.filter(hit => {
          const game = hit.document;

          // Filter by selected platforms
          if (selectedPlatforms.length > 0) {
            const hasMatchingPlatform = selectedPlatforms.some(selectedPlatform =>
              game.platforms && game.platforms.some(platform => platform === selectedPlatform)
            );
            if (!hasMatchingPlatform) return false;
          }

          // Filter by selected genres
          if (selectedGenres.length > 0) {
            const hasMatchingGenre = selectedGenres.some(selectedGenre =>
              game.genres && game.genres.some(genre => genre === selectedGenre)
            );
            if (!hasMatchingGenre) return false;
          }

          return true;
        });

        searchResults = {
          hits: filteredGames,
          found: filteredGames.length,
          page: currentPage
        };

        // Update available filters based on ALL search results (not filtered)
        // This ensures filters show all available options from the search
        const tempResults = { hits: allGames, found: allGames.length };
        const originalResults = searchResults;
        searchResults = tempResults;
        updateAvailableFilters();
        searchResults = originalResults;

        // Only update URL on explicit search submit, not during typing
        // updateUrl();
      } else {
        throw new Error(data.error || 'Search failed');
      }
      
    } catch (error) {
      console.error('Search error:', error);
      searchError = error.message;
    } finally {
      loading = false;
    }
  }
  
  // No auto-search - only search on explicit user action
  
  function handleSearchSubmit({ detail }) {
    // Handle explicit search submission (Enter key)
    currentPage = 1;
    if (searchQuery.trim()) {
      // Perform search if there's a query
      performSearchWithUrl();
    } else {
      // Clear URL if submitting empty search
      searchResults = { hits: [], found: 0 };
      // Clear available filters which will hide the filter panel
      availablePlatforms = [];
      availableGenres = [];
      const newUrl = '/search';
      goto(newUrl, { replaceState: true, noScroll: true });
    }
  }
  
  // Separate function for search with URL update (called on submit)
  async function performSearchWithUrl() {
    await performSearch();
    updateUrl();
  }
  
  function handleSearchInput({ detail }) {
    // Only update search query, don't trigger search or navigation
    searchQuery = detail.value;
    if (!searchQuery.trim()) {
      // Just clear results when search is empty, don't navigate at all
      searchResults = { hits: [], found: 0 };
      // Clear available filters which will hide the filter panel
      availablePlatforms = [];
      availableGenres = [];
      // No URL update to preserve focus completely
    }
  }
  
  function handleSearchBlur() {
    // Search when user loses focus (if there's a query)
    if (searchQuery.trim()) {
      currentPage = 1;
      performSearchWithUrl();
    }
  }

  function handleSearchSuggestion({ detail }) {
    suggestionLoading = true;
    
    // Get autocomplete suggestions from IGDB
    if (detail.query.length >= 2) {
      igdbRequest('search', { q: detail.query, limit: 5 })
        .then(data => {
          if (data.success) {
            searchSuggestions = data.data.map(game => game.title);
          } else {
            searchSuggestions = [];
          }
        })        
        .catch(error => {
          console.error('Suggestion error:', error);
          searchSuggestions = [];
        })
        .finally(() => {
          suggestionLoading = false;
        });
    } else {
      searchSuggestions = [];
      suggestionLoading = false;
    }
  }
  
  function clearSuggestions() {
    searchSuggestions = [];
  }
  
  function updateUrl() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (selectedPlatforms.length > 0) {
      params.set('platforms', selectedPlatforms.join(','));
    }
    if (selectedGenres.length > 0) {
      params.set('genres', selectedGenres.join(','));
    }
    if (sortBy !== 'popularity:desc') {
      params.set('sort', sortBy);
    }
    if (currentPage > 1) {
      params.set('page', currentPage.toString());
    }
    
    const newUrl = params.toString() ? `?${params.toString()}` : '/search';
    goto(newUrl, { replaceState: true, noScroll: true });
  }
  
  function togglePlatformFilter(platform) {
    const index = selectedPlatforms.indexOf(platform);
    if (index > -1) {
      selectedPlatforms = selectedPlatforms.filter(p => p !== platform);
    } else {
      selectedPlatforms = [...selectedPlatforms, platform];
    }
    currentPage = 1;
    performSearchWithUrl();
  }
  
  function toggleGenreFilter(genre) {
    const index = selectedGenres.indexOf(genre);
    if (index > -1) {
      selectedGenres = selectedGenres.filter(g => g !== genre);
    } else {
      selectedGenres = [...selectedGenres, genre];
    }
    currentPage = 1;
    performSearchWithUrl();
  }
  
  function changeSortBy(newSort) {
    sortBy = newSort;
    currentPage = 1;
    performSearchWithUrl();
  }
  
  function goToPage(page) {
    currentPage = page;
    performSearchWithUrl();
    // Scroll to top of results
    document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth' });
  }
  
  function clearAllFilters() {
    selectedPlatforms = [];
    selectedGenres = [];
    sortBy = 'popularity:desc';
    currentPage = 1;
    performSearchWithUrl();
  }
  
  // Game interaction handlers
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

    const gameId = detail.game.igdb_id || detail.game.id;
    const isCurrentlyInWatchlist = userWatchlist.some(item => item.igdb_id == gameId);

    try {
      let response;

      if (isCurrentlyInWatchlist) {
        // Remove from watchlist
        response = await fetch('/api/watchlist/remove', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ game_id: gameId })
        });
      } else {
        // Add to watchlist
        response = await fetch('/api/watchlist/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            game_id: gameId,
            game_data: detail.game
          })
        });
      }

      if (response.ok) {
        const result = await response.json();

        if (result.success) {
          // Update local watchlist state
          if (isCurrentlyInWatchlist) {
            userWatchlist = userWatchlist.filter(item => item.igdb_id != gameId);
          } else {
            userWatchlist = [...userWatchlist, { igdb_id: gameId, ...detail.game }];
          }
        } else {
          console.error('Watchlist operation failed:', result.error);
          // Could add user-facing error notification here
        }
      } else {
        console.error('Watchlist API request failed:', response.status);
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
      // Could add user-facing error notification here
    }
  }
  
  function handleViewDetails({ detail }) {
    // Preserve current search URL in history by using proper navigation
    const currentUrl = $page.url.pathname + $page.url.search;
    goto(`/game/${detail.game.igdb_id || detail.game.id}`, {
      state: { previousUrl: currentUrl }
    });
  }
  
  let totalPages = $derived(Math.ceil(searchResults.found / resultsPerPage));
  let hasActiveFilters = $derived(selectedPlatforms.length > 0 || selectedGenres.length > 0 || sortBy !== 'popularity:desc');
</script>

<svelte:head>
  <title>Search Games - G.G Requestz</title>
  <meta name="description" content="Search our extensive game library with advanced filters and sorting options." />
</svelte:head>

<!-- Background with optional blur effect -->
{#if searchResults.hits.length > 0 && searchResults.hits[0]?.document?.cover_url}
  <div 
    class="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
    style="background-image: url('{searchResults.hits[0].document.cover_url}');"
  >
    <!-- Blur overlay -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
  </div>
{:else}
  <!-- Default gradient background -->
  <div class="fixed inset-0 -z-10 bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900">
    <div class="absolute inset-0 bg-black/40"></div>
  </div>
{/if}

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-white mb-4 drop-shadow-lg">
      Search Games
    </h1>
    <p class="text-lg text-gray-200 max-w-2xl mx-auto mb-6 drop-shadow">
      Discover games from our extensive library using powerful search and filtering options.
    </p>
    
    <!-- Search Bar -->
    <div class="max-w-2xl mx-auto">
      <SearchBar
        bind:value={searchQuery}
        suggestions={searchSuggestions}
        loading={suggestionLoading}
        placeholder="Search for games, genres, platforms..."
        on:submit={handleSearchSubmit}
        on:input={handleSearchInput}
        on:search={handleSearchSuggestion}
        on:select={handleSearchSubmit}
        on:blur={handleSearchBlur}
        on:clear-suggestions={clearSuggestions}
      />
    </div>
  </div>
  
  <!-- Filters and Sort -->
  <div class="mb-6">
    <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-4">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <!-- Filter Toggle (Mobile) -->
        <div class="lg:hidden">
          <button
            type="button"
            onclick={() => showFilters = !showFilters}
            class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
          </svg>
          <span>Filters</span>
          {#if hasActiveFilters}
            <StatusBadge status="active" size="xs" />
          {/if}
        </button>
      </div>
      
      <!-- Sort Options -->
      <div class="flex items-center space-x-4">
        <label for="sort-select" class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Sort by:
        </label>
        <select
          id="sort-select"
          bind:value={sortBy}
          onchange={() => changeSortBy(sortBy)}
          class="rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="popularity:desc">Most Popular</option>
          <option value="release_date:desc">Newest First</option>
          <option value="release_date:asc">Oldest First</option>
          <option value="title:asc">Title A-Z</option>
          <option value="title:desc">Title Z-A</option>
          <option value="rating:desc">Highest Rated</option>
        </select>
      </div>
      
      <!-- Results Count -->
      <div class="text-sm text-gray-500 dark:text-gray-400">
        {#if searchResults.found > 0}
          Showing {((currentPage - 1) * resultsPerPage) + 1}-{Math.min(currentPage * resultsPerPage, searchResults.found)} of {searchResults.found} results
        {:else if searchQuery || hasActiveFilters}
          No results found
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Filter Panel (Desktop) or Collapsible (Mobile) -->
  {#if availablePlatforms.length > 0 || availableGenres.length > 0 || showFilters}
    <div
      class="mb-6 transition-all duration-300 ease-in-out overflow-hidden"
      class:hidden={!showFilters && availablePlatforms.length === 0 && availableGenres.length === 0}
      class:lg:block={true}
      style="margin-top: 30px;"
    >
      <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-4 transform transition-all duration-300 ease-in-out"
           class:translate-y-0={availablePlatforms.length > 0 || availableGenres.length > 0}
           class:opacity-100={availablePlatforms.length > 0 || availableGenres.length > 0}
           class:-translate-y-4={availablePlatforms.length === 0 && availableGenres.length === 0}
           class:opacity-0={availablePlatforms.length === 0 && availableGenres.length === 0}>
        <div class="flex flex-col lg:flex-row lg:items-start lg:space-x-8 space-y-4 lg:space-y-0">
          <!-- Platform Filters -->
          {#if availablePlatforms.length > 0}
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Platforms
              </h3>
              <div class="grid grid-cols-2 gap-2">
                {#each availablePlatforms.slice(0, 8) as platform}
                  <label class="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform.value)}
                      onchange={() => togglePlatformFilter(platform.value)}
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-gray-700 dark:text-gray-300">
                      {platform.value} ({platform.count})
                    </span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Genre Filters -->
          {#if availableGenres.length > 0}
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Genres
              </h3>
              <div class="grid grid-cols-2 gap-2">
                {#each availableGenres.slice(0, 8) as genre}
                  <label class="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedGenres.includes(genre.value)}
                      onchange={() => toggleGenreFilter(genre.value)}
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-gray-700 dark:text-gray-300">
                      {genre.value} ({genre.count})
                    </span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Clear Filters -->
          {#if hasActiveFilters}
            <div class="flex-shrink-0">
              <button
                type="button"
                onclick={clearAllFilters}
                class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                Clear all filters
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Search Error -->
  {#if searchError}
    <div class="bg-red-50/95 dark:bg-red-900/95 backdrop-blur-sm border border-red-200/50 dark:border-red-700/50 rounded-lg shadow-lg p-4 mb-6">
      <div class="flex">
        <svg class="w-5 h-5 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <div>
          <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
            Search Error
          </h3>
          <p class="text-sm text-red-700 dark:text-red-300 mt-1">
            {searchError}
          </p>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" text="Searching games..." />
    </div>
  {:else}
    <!-- Search Results -->
    <div id="search-results">
      {#if searchResults.hits.length > 0}
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 mb-8">
          {#each searchResults.hits as hit}
            {@const game = hit.document}
            <GameCard 
              {game} 
              {user}
              isInWatchlist={userWatchlist.some(w => w.igdb_id === game.igdb_id)}
              preserveState={true}
              enablePreloading={true}
              on:request={handleGameRequest}
              on:watchlist={handleWatchlist}
              on:view-details={handleViewDetails}
            />
          {/each}
        </div>
        
        <!-- Pagination -->
        {#if totalPages > 1}
          <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-4">
            <div class="flex items-center justify-center space-x-2">
            <!-- Previous Page -->
            <button
              type="button"
              disabled={currentPage <= 1}
              onclick={() => goToPage(currentPage - 1)}
              class="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:disabled:bg-gray-900"
            >
              Previous
            </button>
            
            <!-- Page Numbers -->
            {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const start = Math.max(1, currentPage - 2);
              return start + i;
            }) as pageNum}
              {#if pageNum <= totalPages}
                <button
                  type="button"
                  onclick={() => goToPage(pageNum)}
                  class="px-3 py-2 text-sm font-medium rounded-lg transition-colors"
                  class:bg-blue-600={currentPage === pageNum}
                  class:text-white={currentPage === pageNum}
                  class:hover:bg-blue-700={currentPage === pageNum}
                  class:text-gray-500={currentPage !== pageNum}
                  class:bg-white={currentPage !== pageNum}
                  class:border={currentPage !== pageNum}
                  class:border-gray-300={currentPage !== pageNum}
                  class:hover:bg-gray-50={currentPage !== pageNum}
                  class:dark:bg-gray-800={currentPage !== pageNum}
                  class:dark:border-gray-600={currentPage !== pageNum}
                  class:dark:text-gray-400={currentPage !== pageNum}
                  class:dark:hover:bg-gray-700={currentPage !== pageNum}
                >
                  {pageNum}
                </button>
              {/if}
            {/each}
            
            <!-- Next Page -->
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onclick={() => goToPage(currentPage + 1)}
              class="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:disabled:bg-gray-900"
            >
              Next
            </button>
            </div>
          </div>
        {/if}
      {:else if searchQuery || hasActiveFilters}
        <!-- No Results -->
        <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-12 text-center">
          <!-- Empty game cover placeholder -->
          <div class="w-32 h-40 mx-auto mb-6 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg shadow-lg flex items-center justify-center">
            <Icon icon="line-md:remove" class="w-16 h-16 text-white" />
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No games found
          </h3>
          <p class="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Try adjusting your search terms or clearing some filters to discover more games.
          </p>
          {#if hasActiveFilters}
            <button
              type="button"
              onclick={clearAllFilters}
              class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Clear all filters
            </button>
          {/if}
        </div>
      {:else}
        <!-- Empty State with cover placeholder -->
        <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-12 text-center">
          <!-- Game cover placeholder -->
          <div class="w-32 h-40 mx-auto mb-6 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg shadow-lg flex items-center justify-center">
            <Icon icon="line-md:search" class="w-16 h-16 text-white" />
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Start searching for games
          </h3>
          <p class="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Enter a game title, genre, or platform to discover amazing games from our extensive library.
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
</div>