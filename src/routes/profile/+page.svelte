<!--
  User profile page with watchlist management
-->

<script>
  import { goto } from '$app/navigation';
  import GameCard from '../../components/GameCard.svelte';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import { removeFromWatchlist, igdbRequest } from '$lib/api.client.js';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let userWatchlist = $state(data?.userWatchlist || []);
  let userRequests = $state(data?.userRequests || []);
  let loading = $state(false);
  
  // Store cover URLs for requests
  let requestCoverUrls = $state(new Map());
  
  let activeTab = $state('watchlist');
  
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
  
  async function removeFromWatchlistHandler(watchlistId) {
    loading = true;
    try {
      const result = await removeFromWatchlist(watchlistId);
      
      if (result.success) {
        // Remove from local list
        userWatchlist = userWatchlist.filter(item => item.id !== watchlistId);
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
    if (confirm('Are you sure you want to remove this game from your watchlist?')) {
      removeFromWatchlistHandler(detail.game.id);
    }
  }
  
  function handleViewDetails({ detail }) {
    goto(`/game/${detail.game.igdb_id || detail.game.id}`);
  }
  
  function getRequestStatusColor(status) {
    const colorMap = {
      'pending': 'text-yellow-600',
      'approved': 'text-blue-600', 
      'fulfilled': 'text-green-600',
      'rejected': 'text-red-600'
    };
    return colorMap[status] || 'text-gray-600';
  }
</script>

<svelte:head>
  <title>My Profile - GameRequest</title>
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
            <a 
              href="/search"
              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Find more games →
            </a>
          </div>
          
          {#if userWatchlist.length > 0}
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
              {#each userWatchlist as watchlistItem}
                <GameCard
                  game={watchlistItem}
                  {user}
                  isInWatchlist={true}
                  showWatchlist={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlistRemove}
                  on:view-details={handleViewDetails}
                />
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
              <a
                href="/search"
                class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Browse Games
              </a>
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
            <a 
              href="/request"
              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Make new request →
            </a>
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
                    
                    <!-- Priority Badge -->
                    {#if request.priority && request.priority !== 'medium'}
                      <div class="ml-4">
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
                      </div>
                    {/if}
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
              <a
                href="/request"
                class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Make Your First Request
              </a>
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