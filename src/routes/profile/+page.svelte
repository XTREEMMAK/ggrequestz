<!--
  User profile page with watchlist management
-->

<script>
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import GameCard from '../../components/GameCard.svelte';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import { igdbRequest, rescindRequest } from '$lib/api.client.js';
  import { watchlistService } from '$lib/clientServices.js';
  import { toasts } from '$lib/stores/toast.js';
  import { updateWatchlistStatus } from '$lib/watchlistStatus.js';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let userWatchlist = $state(data?.userWatchlist || []);
  let userRequests = $state(data?.userRequests || []);
  let loading = $state(false);
  
  // Store cover URLs for requests
  let requestCoverUrls = $state(new Map());
  
  let activeTab = $state('watchlist');

  // Bulk selection state
  let selectedItems = $state(new Set());
  let bulkSelectMode = $state(false);
  let bulkLoading = $state(false);

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');

  let tabs = $derived([
    { id: 'watchlist', label: 'My Watchlist', count: userWatchlist.length },
    { id: 'requests', label: 'My Requests', count: userRequests.length }
  ]);
  
  // Redirect to login if not authenticated
  $effect(() => {
    if (!user) {
      goto('/api/auth/login');
    }
  });
  
  function switchTab(tabId) {
    activeTab = tabId;
    
    // Fetch cover URLs when switching to requests tab
    if (tabId === 'requests' && requestCoverUrls.size === 0) {
      fetchRequestCoverUrls();
    }
  }
  
  async function fetchRequestCoverUrls() {
    // Find requests with igdb_id but no cover URL yet
    const requestsNeedingCovers = userRequests.filter(
      request => request.igdb_id && !requestCoverUrls.has(request.id)
    );
    
    if (requestsNeedingCovers.length === 0) return;
    
    try {
      // Fetch cover URLs for requests with igdb_id
      for (const request of requestsNeedingCovers) {
        try {
          const result = await igdbRequest('game', { id: request.igdb_id });
          if (result.success && result.data.length > 0 && result.data[0].cover_url) {
            requestCoverUrls.set(request.id, result.data[0].cover_url);
          }
        } catch (error) {
          console.warn(`Failed to fetch cover for request ${request.id}:`, error);
        }
      }
      // Trigger reactivity
      requestCoverUrls = new Map(requestCoverUrls);
    } catch (error) {
      console.error('Error fetching request cover URLs:', error);
    }
  }
  
  async function removeFromWatchlistHandler(igdbId) {
    loading = true;
    try {
      const success = await watchlistService.removeFromWatchlist(igdbId);
      const result = { success };
      
      if (result.success) {
        // Remove from local list
        userWatchlist = userWatchlist.filter(item => item.igdb_id !== igdbId);
        // Update global watchlist cache so other pages (like homepage) reflect the change
        updateWatchlistStatus(igdbId, false);
      } else {
        throw new Error(result.error || 'Failed to remove from watchlist');
      }
    } catch (error) {
      console.error('Remove from watchlist error:', error);
      alert('Failed to remove from watchlist. Please try again.');
    } finally {
      loading = false;
    }
  }
  
  function handleGameRequest({ detail }) {
    goto(`/request?game=${detail.game.igdb_id || detail.game.id}`);
  }
  
  function handleWatchlistRemove({ detail }) {
    const game = detail.game;
    showConfirmation(
      'Remove from Watchlist',
      `Are you sure you want to remove "${game.title}" from your watchlist? This action cannot be undone.`,
      () => removeFromWatchlistHandler(game.igdb_id)
    );
  }
  
  function handleViewDetails({ detail }) {
    goto(`/game/${detail.game.igdb_id || detail.game.id}`);
  }

  // Confirmation dialog helpers
  function showConfirmation(title, message, action) {
    confirmTitle = title;
    confirmMessage = message;
    confirmAction = action;
    showConfirmDialog = true;
  }

  function handleConfirmYes() {
    showConfirmDialog = false;
    if (confirmAction) {
      confirmAction();
    }
  }

  function handleConfirmNo() {
    showConfirmDialog = false;
    confirmAction = null;
  }

  // Bulk selection functions
  function toggleBulkMode() {
    bulkSelectMode = !bulkSelectMode;
    if (!bulkSelectMode) {
      selectedItems = new Set(); // Clear and trigger reactivity
    }
  }

  function toggleItemSelection(igdbId) {
    if (selectedItems.has(igdbId)) {
      selectedItems.delete(igdbId);
    } else {
      selectedItems.add(igdbId);
    }

    // Force reactivity by creating a new Set
    selectedItems = new Set(selectedItems);
  }

  function selectAll() {
    userWatchlist.forEach(item => selectedItems.add(item.igdb_id));
    selectedItems = new Set(selectedItems); // trigger reactivity
  }

  function deselectAll() {
    selectedItems = new Set(); // trigger reactivity with new empty set
  }

  function initiateBulkRemove() {
    if (selectedItems.size === 0) return;

    showConfirmation(
      'Remove Games from Watchlist',
      `Are you sure you want to remove ${selectedItems.size} games from your watchlist? This action cannot be undone.`,
      bulkRemoveFromWatchlist
    );
  }

  async function bulkRemoveFromWatchlist() {

    bulkLoading = true;
    const selectedIds = Array.from(selectedItems);
    const results = [];

    try {
      // Process in batches to avoid overwhelming the server
      for (let i = 0; i < selectedIds.length; i += 5) {
        const batch = selectedIds.slice(i, i + 5);
        const batchPromises = batch.map(async (igdbId) => {
          try {
            const success = await watchlistService.removeFromWatchlist(igdbId);
            return { igdbId, success };
          } catch (error) {
            console.error(`Failed to remove ${igdbId}:`, error);
            return { igdbId, success: false, error };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches
        if (i + 5 < selectedIds.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Update local state based on results
      const successfulRemovals = results.filter(r => r.success).map(r => r.igdbId);
      const failedRemovals = results.filter(r => !r.success);

      if (successfulRemovals.length > 0) {
        userWatchlist = userWatchlist.filter(item => !successfulRemovals.includes(item.igdb_id));
        // Update global watchlist cache for all successfully removed items
        successfulRemovals.forEach(igdbId => {
          updateWatchlistStatus(igdbId, false);
        });
      }

      // Clear selections
      selectedItems = new Set();
      bulkSelectMode = false;

      // Show results
      if (failedRemovals.length === 0) {
        toasts.success(`Successfully removed ${successfulRemovals.length} games from your watchlist.`);
      } else {
        toasts.warning(`Removed ${successfulRemovals.length} games successfully. ${failedRemovals.length} failed to remove.`);
      }

    } catch (error) {
      console.error('Bulk remove error:', error);
      toasts.error('Failed to complete bulk removal. Please try again.');
    } finally {
      bulkLoading = false;
    }
  }

  function initiateRescindRequest(request) {
    showConfirmation(
      'Remove Game Request',
      `Are you sure you want to remove your request for "${request.title}"? This action cannot be undone.`,
      () => handleRescindRequest(request)
    );
  }

  async function handleRescindRequest(request) {
    loading = true;
    try {
      const result = await rescindRequest(request.id);

      if (result.success) {
        // Update local state
        userRequests = userRequests.map(req =>
          req.id === request.id
            ? { ...req, status: 'cancelled', updated_at: result.request.updated_at }
            : req
        );
        toasts.success(`Successfully removed request for "${request.title}"`);
      } else {
        throw new Error(result.error || 'Failed to remove request');
      }
    } catch (error) {
      console.error('Remove request error:', error);

      // Extract more specific error information
      let errorMessage = 'Failed to remove request. Please try again.';
      if (error.message && error.message !== 'Failed to remove request') {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Show error in toast instead of alert
      toasts.error(errorMessage);
    } finally {
      loading = false;
    }
  }
  
  function getRequestStatusColor(status) {
    const colorMap = {
      'pending': 'text-yellow-600',
      'approved': 'text-blue-600', 
      'fulfilled': 'text-green-600',
      'rejected': 'text-red-600',
      'cancelled': 'text-gray-600'
    };
    return colorMap[status] || 'text-gray-600';
  }
</script>

<svelte:head>
  <title>My Profile - G.G Requestz</title>
  <meta name="description" content="Manage your game watchlist and view your request history." />
</svelte:head>

{#if user}
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Profile Header -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
      <div class="flex items-center space-x-4">
        <!-- Avatar -->
        <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
          <span class="text-2xl font-bold text-white">
            {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
        
        <!-- User Info -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {user.name || user.preferred_username || 'User'}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {user.email}
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Member since {formatDate(user.iat ? new Date(user.iat * 1000) : new Date())}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Tab Navigation -->
    <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
      <nav class="-mb-px flex space-x-8">
        {#each tabs as tab}
          <button
            type="button"
            onclick={() => switchTab(tab.id)}
            class="whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm transition-colors"
            class:border-blue-500={activeTab === tab.id}
            class:text-blue-600={activeTab === tab.id}
            class:dark:text-blue-400={activeTab === tab.id}
            class:border-transparent={activeTab !== tab.id}
            class:text-gray-500={activeTab !== tab.id}
            class:hover:text-gray-700={activeTab !== tab.id}
            class:dark:text-gray-400={activeTab !== tab.id}
            class:dark:hover:text-gray-300={activeTab !== tab.id}
          >
            {tab.label}
            {#if tab.count > 0}
              <span class="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-0.5 px-2 rounded-full text-xs">
                {tab.count}
              </span>
            {/if}
          </button>
        {/each}
      </nav>
    </div>
    
    <!-- Loading State -->
    {#if loading}
      <div class="flex justify-center py-12">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    {:else}
      <!-- Watchlist Tab -->
      {#if activeTab === 'watchlist'}
        <div>
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              My Watchlist ({userWatchlist.length})
            </h2>
            <div class="flex items-center gap-3">
              {#if userWatchlist.length > 0}
                <button
                  type="button"
                  onclick={toggleBulkMode}
                  class="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 text-sm font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded px-3 py-1"
                  disabled={bulkLoading}
                >
                  {bulkSelectMode ? 'Cancel' : 'Select Multiple'}
                </button>
              {/if}
              <button
                type="button"
                onclick={() => goto('/search')}
                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                aria-label="Navigate to Search"
              >
                Find more games →
              </button>
            </div>
          </div>

          {#if bulkSelectMode && userWatchlist.length > 0}
            <div class="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <span class="text-sm font-medium text-gray-900 dark:text-white">
                    {selectedItems.size} selected
                  </span>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onclick={selectAll}
                      class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      disabled={selectedItems.size === userWatchlist.length || bulkLoading}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onclick={deselectAll}
                      class="text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                      disabled={selectedItems.size === 0 || bulkLoading}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={initiateBulkRemove}
                  disabled={selectedItems.size === 0 || bulkLoading}
                  class="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  {#if bulkLoading}
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Removing...
                  {:else}
                    Remove Selected ({selectedItems.size})
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          
          {#if userWatchlist.length > 0}
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
              {#each userWatchlist as watchlistItem}
                <div class="relative">
                  {#if bulkSelectMode}
                    <!-- Custom card for bulk select mode -->
                    <button
                      type="button"
                      class="w-full aspect-[3/4] relative rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 group"
                      onclick={() => toggleItemSelection(watchlistItem.igdb_id)}
                      aria-label="Select {watchlistItem.title} for bulk operation"
                    >
                      <!-- Game cover -->
                      <img
                        src={watchlistItem.cover_url}
                        alt={watchlistItem.title}
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />

                      <!-- Selection overlay -->
                      <div class="absolute inset-0 transition-all duration-200 group-hover:bg-[oklch(0.62_0.21_259.82/0.2)] {selectedItems.has(watchlistItem.igdb_id) ? 'bg-[oklch(0.62_0.21_259.82/0.4)]' : 'bg-transparent'}">
                        <div class="absolute inset-0 flex items-center justify-center">
                          <!-- Selection indicator -->
                          <div class="w-12 h-12 rounded-full border-3 border-white bg-black bg-opacity-50 flex items-center justify-center transition-all duration-200 {selectedItems.has(watchlistItem.igdb_id) ? 'bg-blue-500 bg-opacity-100' : 'bg-opacity-30'}">
                            {#if selectedItems.has(watchlistItem.igdb_id)}
                              <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                              </svg>
                            {:else}
                              <svg class="w-6 h-6 text-white opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                              </svg>
                            {/if}
                          </div>
                        </div>
                      </div>

                      <!-- Selection ring around the card -->
                      {#if selectedItems.has(watchlistItem.igdb_id)}
                        <div class="absolute inset-0 rounded-lg ring-3 ring-blue-400 ring-opacity-80 pointer-events-none"></div>
                      {/if}

                      <!-- Game title overlay at bottom -->
                      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3">
                        <h3 class="text-white text-sm font-medium truncate">
                          {watchlistItem.title}
                        </h3>
                      </div>
                    </button>
                  {:else}
                    <!-- Normal GameCard for regular mode -->
                    <GameCard
                      game={watchlistItem}
                      {user}
                      isInWatchlist={true}
                      showWatchlist={true}
                      on:request={handleGameRequest}
                      on:watchlist={handleWatchlistRemove}
                      on:view-details={handleViewDetails}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
              </svg>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Your watchlist is empty
              </h3>
              <p class="text-gray-500 dark:text-gray-400 mb-4">
                Start building your game collection by adding games to your watchlist.
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
          {/if}
        </div>
      {/if}
      
      <!-- Requests Tab -->
      {#if activeTab === 'requests'}
        <div>
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              My Requests ({userRequests.length})
            </h2>
            <button
              type="button"
              onclick={() => goto('/request')}
              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
              aria-label="Navigate to Request"
            >
              Make new request →
            </button>
          </div>
          
          {#if userRequests.length > 0}
            <div class="space-y-4">
              {#each userRequests as request}
                <div class="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 overflow-hidden">
                  {#if requestCoverUrls.has(request.id)}
                    <!-- Background cover art positioned on the right -->
                    <div class="absolute inset-0 z-0 flex justify-end">
                      <div class="w-1/3 h-full relative">
                        <img
                          src={requestCoverUrls.get(request.id)}
                          alt="{request.title} cover"
                          class="w-full h-full object-cover"
                        />
                        <!-- Gradient overlay from right (cover) to left (original background) -->
                        <div class="absolute inset-0 bg-gradient-to-l from-transparent to-white dark:to-gray-800"></div>
                      </div>
                    </div>
                  {/if}
                  <!-- Content overlay -->
                  <div class="relative z-10 flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center space-x-3 mb-2">
                        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                          {request.title}
                        </h3>
                        <StatusBadge status={request.status} />
                        <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {request.request_type}
                        </span>
                      </div>
                      
                      <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        Submitted {formatDate(request.created_at)}
                        {#if request.updated_at !== request.created_at}
                          • Updated {formatDate(request.updated_at)}
                        {/if}
                      </div>
                      
                      {#if request.platforms && request.platforms.length > 0}
                        <div class="mb-3">
                          <span class="text-sm text-gray-600 dark:text-gray-400">Platforms: </span>
                          {#each request.platforms as platform, index}
                            <span class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded mr-1">
                              {platform}
                            </span>
                          {/each}
                        </div>
                      {/if}
                      
                      {#if request.reason}
                        <div class="mb-3">
                          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Reason: </span>
                          <span class="text-sm text-gray-600 dark:text-gray-400">{request.reason}</span>
                        </div>
                      {/if}
                      
                      {#if request.description}
                        <div class="mb-3">
                          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Description: </span>
                          <span class="text-sm text-gray-600 dark:text-gray-400">{request.description}</span>
                        </div>
                      {/if}
                      
                      {#if request.admin_notes}
                        <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded p-3 mt-3">
                          <span class="text-sm font-medium text-blue-800 dark:text-blue-200">Admin Notes: </span>
                          <span class="text-sm text-blue-700 dark:text-blue-300">{request.admin_notes}</span>
                        </div>
                      {/if}
                    </div>
                    
                    <!-- Actions and Priority Badge -->
                    <div class="ml-4 flex flex-col items-end gap-2">
                      <!-- Rescind Button -->
                      {#if ['pending', 'approved'].includes(request.status)}
                        <button
                          onclick={() => initiateRescindRequest(request)}
                          class="text-xs px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 rounded-md transition-colors font-medium"
                          disabled={loading}
                        >
                          Remove Request
                        </button>
                      {/if}

                      <!-- Priority Badge -->
                      {#if request.priority && request.priority !== 'medium'}
                        <span class="text-xs font-medium px-2 py-1 rounded-full"
                              class:bg-red-100={request.priority === 'high'}
                              class:text-red-800={request.priority === 'high'}
                              class:dark:bg-red-900={request.priority === 'high'}
                              class:dark:text-red-200={request.priority === 'high'}
                              class:bg-gray-100={request.priority === 'low'}
                              class:text-gray-800={request.priority === 'low'}
                              class:dark:bg-gray-700={request.priority === 'low'}
                              class:dark:text-gray-300={request.priority === 'low'}
                        >
                          {request.priority} priority
                        </span>
                      {/if}
                    </div>
                  </div>
                  </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No requests yet
              </h3>
              <p class="text-gray-500 dark:text-gray-400 mb-4">
                You haven't submitted any game requests. Start by requesting a game you'd like to see added.
              </p>
              <button
                type="button"
                onclick={() => goto('/request')}
                class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Navigate to Request"
              >
                Make Your First Request
              </button>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <!-- Loading or redirect state -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" text="Loading profile..." />
    </div>
  </div>
{/if}

<!-- Confirmation Modal -->
{#if showConfirmDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 m-4 max-w-md w-full shadow-xl border border-red-200 dark:border-red-700">
      <!-- Warning Icon and Title -->
      <div class="flex items-center mb-4">
        <div class="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mr-3">
          <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <h3 id="confirm-title" class="text-lg font-semibold text-gray-900 dark:text-white">
          {confirmTitle}
        </h3>
      </div>

      <p class="text-gray-600 dark:text-gray-300 mb-6 ml-13">
        {confirmMessage}
      </p>

      <div class="flex gap-3 justify-end">
        <button
          onclick={handleConfirmNo}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          onclick={handleConfirmYes}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}