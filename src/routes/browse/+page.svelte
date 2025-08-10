<!--
  Browse categories page - genres and publishers
-->

<script>
  import SEOHead from '../../components/SEOHead.svelte';
  import { goto } from '$app/navigation';
  
  let { data } = $props();
  
  let genres = $derived(data?.genres || []);
  let publishers = $derived(data?.publishers || []);
  
  function handleGenreClick(genre) {
    goto(`/browse/genres/${encodeURIComponent(genre.slug)}`);
  }
  
  function handlePublisherClick(publisher) {
    goto(`/browse/publishers/${encodeURIComponent(publisher.slug)}`);
  }
</script>

<SEOHead 
  title="Browse Games - GG Requestz"
  description="Browse games by genre, publisher, and other categories. Discover new games in your favorite categories."
  ogTitle="Browse Games - GG Requestz"
  ogDescription="Explore games organized by genres, publishers, and more. Find exactly what you're looking for."
/>

<div class="px-8 py-6">
  <!-- Genres Section -->
  <section class="mb-12">
    <h1 class="text-3xl font-bold text-white mb-6">Browse by Genre</h1>
    
    {#if genres.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {#each genres as genre}
          <button
            class="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-left transition-colors group"
            onclick={() => handleGenreClick(genre)}
          >
            <div class="text-white font-medium text-sm mb-1 group-hover:text-blue-400 transition-colors">
              {genre.name}
            </div>
            <div class="text-gray-400 text-xs">
              {genre.count} games
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="text-center py-8 text-gray-400">
        <p>No genres available</p>
      </div>
    {/if}
  </section>
  
  <!-- Publishers Section -->
  <section class="mb-12">
    <h2 class="text-3xl font-bold text-white mb-6">Browse by Publisher</h2>
    
    {#if publishers.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {#each publishers as publisher}
          <button
            class="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-left transition-colors group"
            onclick={() => handlePublisherClick(publisher)}
          >
            <div class="text-white font-medium text-sm mb-1 group-hover:text-green-400 transition-colors">
              {publisher.name}
            </div>
            <div class="text-gray-400 text-xs">
              {publisher.count} games
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="text-center py-8 text-gray-400">
        <p>No publishers available</p>
      </div>
    {/if}
  </section>
</div>