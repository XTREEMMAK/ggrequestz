<!--
  Reusable Load More button component with loading state and preloading support
-->

<script>
  import { createEventDispatcher } from 'svelte';
  
  let { 
    loading = false,
    disabled = false,
    preloader = null,
    text = "Load More",
    loadingText = "Loading...",
    class: className = ""
  } = $props();
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    dispatch('load');
  }
  
  function handleMouseEnter() {
    if (preloader && !loading && !disabled) {
      preloader.preload();
    }
  }
  
  function handleMouseLeave() {
    if (preloader && !loading && !disabled) {
      preloader.cancel();
    }
  }
</script>

<button
  class="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed {className}"
  onclick={handleClick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  {disabled}
>
  {#if loading}
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      {loadingText}
    </div>
  {:else}
    {text}
  {/if}
</button>