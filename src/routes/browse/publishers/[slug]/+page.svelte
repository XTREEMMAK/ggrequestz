<!--
  Browse games by publisher
-->

<script>
  import GameCard from '../../../../components/GameCard.svelte';
  import LoadingSpinner from '../../../../components/LoadingSpinner.svelte';
  import SEOHead from '../../../../components/SEOHead.svelte';
  import { goto } from '$app/navigation';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let publisher = $derived(data?.publisher);
  let games = $state(data?.games || []);
  let userWatchlist = $derived(data?.userWatchlist || []);
  let loading = $state(false);
  let currentPage = $state(1);
  const ITEMS_PER_PAGE = 24;
  
  function handleGameRequest({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
    goto(`/request?game=${detail.game.igdb_id || detail.game.id}`);
  }
  
  function handleWatchlist({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
  }
  
  function handleViewDetails({ detail }) {
    goto(`/game/${detail.game.igdb_id || detail.game.id}`);
  }
  
  async function loadMoreGames() {
    if (loading) return;
    
    loading = true;
    try {
      const response = await fetch(`/api/browse/publishers/${publisher.slug}?page=${currentPage + 1}&limit=${ITEMS_PER_PAGE}`);
      if (response.ok) {
        const data = await response.json();
        if (data.games && data.games.length > 0) {
          games = [...games, ...data.games];
          currentPage += 1;
        }
      }
    } catch (error) {
      console.error('Failed to load more games:', error);
    } finally {
      loading = false;
    }
  }
</script>

<SEOHead 
  title="{publisher?.name || 'Publisher'} Games - GG Requestz"
  description="Browse games published by {publisher?.name || 'publisher'}. Discover and request titles from this publisher."
  ogTitle="{publisher?.name || 'Publisher'} Games - GG Requestz"
  ogDescription="Explore games from {publisher?.name || 'publisher'} with powerful search and filtering."
/>

<div class="px-8 py-6">
  <!-- Header -->
  <div class="mb-8">
    <nav class="text-sm text-gray-400 mb-4">
      <a href="/" class="hover:text-white transition-colors">Home</a>
      <span class="mx-2">/</span>
      <a href="/browse" class="hover:text-white transition-colors">Browse</a>
      <span class="mx-2">/</span>
      <span class="text-white">{publisher?.name || 'Publisher'}</span>
    </nav>
    
    <h1 class="text-3xl font-bold text-white mb-2">{publisher?.name || 'Publisher'}</h1>
    <p class="text-gray-400">
      {games.length} games available
      {#if publisher?.description}
        • {publisher.description}
      {/if}
    </p>
  </div>
  
  <!-- Games Grid -->
  {#if games.length > 0}
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 mb-8">
      {#each games as game}
        <GameCard 
          {game} 
          {user}
          isInWatchlist={userWatchlist.some(w => w.igdb_id === game.igdb_id)}
          on:request={handleGameRequest}
          on:watchlist={handleWatchlist}
          on:view-details={handleViewDetails}
        />
      {/each}
    </div>
    
    <!-- Load More Button -->
    <div class="flex justify-center">
      <button
        class="bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 px-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={loadMoreGames}
        disabled={loading}
      >
        {#if loading}
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Loading...
          </div>
        {:else}
          Load More Games
        {/if}
      </button>
    </div>
  {:else}
    <div class="text-center py-12 text-gray-400">
      <p>No games found for this publisher</p>
      <a href="/browse" class="text-blue-400 hover:text-blue-300 transition-colors mt-2 inline-block">
        Browse other categories
      </a>
    </div>
  {/if}
</div>