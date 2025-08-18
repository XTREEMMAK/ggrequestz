<!--
  Browse games by genre
-->

<script>
  import GameCard from '../../../../components/GameCard.svelte';
  import LoadingSpinner from '../../../../components/LoadingSpinner.svelte';
  import SEOHead from '../../../../components/SEOHead.svelte';
  import LoadMoreButton from '../../../../components/LoadMoreButton.svelte';
  import { goto } from '$app/navigation';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let genre = $derived(data?.genre);
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
      const response = await fetch(`/api/browse/genres/${genre.slug}?page=${currentPage + 1}&limit=${ITEMS_PER_PAGE}`);
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
  title="{genre?.name || 'Genre'} Games - GG Requestz"
  description="Browse {genre?.name || 'genre'} games. Discover and request your favorite {genre?.name || 'genre'} titles."
  ogTitle="{genre?.name || 'Genre'} Games - GG Requestz"
  ogDescription="Explore our collection of {genre?.name || 'genre'} games with powerful search and filtering."
/>

<div class="px-8 py-6">
  <!-- Header -->
  <div class="mb-8">
    <nav class="text-sm text-gray-400 mb-4">
      <button
        type="button"
        onclick={() => goto('/')}
        class="hover:text-white transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
        aria-label="Navigate to Home"
      >
        Home
      </button>
      <span class="mx-2">/</span>
      <button
        type="button"
        onclick={() => goto('/browse')}
        class="hover:text-white transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
        aria-label="Navigate to Browse"
      >
        Browse
      </button>
      <span class="mx-2">/</span>
      <span class="text-white">{genre?.name || 'Genre'}</span>
    </nav>
    
    <h1 class="text-3xl font-bold text-white mb-2">{genre?.name || 'Genre'} Games</h1>
    <p class="text-gray-400">
      {games.length} games available
      {#if genre?.description}
        • {genre.description}
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
          enablePreloading={true}
          on:request={handleGameRequest}
          on:watchlist={handleWatchlist}
          on:view-details={handleViewDetails}
        />
      {/each}
    </div>
    
    <!-- Load More Button -->
    <div class="flex justify-center">
      <LoadMoreButton
        loading={loading}
        disabled={loading}
        text="Load More Games"
        on:load={loadMoreGames}
      />
    </div>
  {:else}
    <div class="text-center py-12 text-gray-400">
      <p>No games found for this genre</p>
      <a href="/browse" class="text-blue-400 hover:text-blue-300 transition-colors mt-2 inline-block">
        Browse other categories
      </a>
    </div>
  {/if}
</div>