<!--
  Enhanced skeleton loader component with multiple variants
  Inspired by Skeleton.dev placeholders for better UX
-->
<script>
  export let variant = "default"; // "default", "card", "list", "circle", "text", "image"
  export let width = "100%";
  export let height = "200px";
  export let rounded = "md";
  export let animate = true;
  export let lines = 3; // For text variant
  export let aspectRatio = "2/3"; // For card variant
</script>

{#if variant === "card"}
  <!-- Game card specific skeleton that matches GameCard layout -->
  <div class="relative overflow-hidden rounded-{rounded} bg-gray-800 aspect-{aspectRatio} w-full {animate ? 'animate-pulse' : ''}" role="img" aria-label="Loading game card...">
    <!-- Main image area -->
    <div class="w-full h-full bg-gray-700"></div>
    
    <!-- Status badge -->
    <div class="absolute top-2 left-2">
      <div class="bg-gray-600 rounded-full w-12 h-5"></div>
    </div>
    
    <!-- Rating badge -->
    <div class="absolute top-2 right-2">
      <div class="bg-gray-600 rounded w-8 h-6"></div>
    </div>
    
    <!-- Action buttons -->
    <div class="absolute bottom-2 right-2">
      <div class="bg-gray-600 rounded-full w-8 h-8"></div>
    </div>
  </div>

{:else if variant === "list"}
  <!-- List item skeleton -->
  <div class="flex items-center space-x-4 p-4 {animate ? 'animate-pulse' : ''}" role="img" aria-label="Loading list item...">
    <div class="bg-gray-600 rounded-{rounded} w-16 h-16 flex-shrink-0"></div>
    <div class="flex-1 space-y-2">
      <div class="bg-gray-600 rounded h-4 w-3/4"></div>
      <div class="bg-gray-600 rounded h-3 w-1/2"></div>
    </div>
  </div>

{:else if variant === "circle"}
  <!-- Circular skeleton -->
  <div 
    class="bg-gray-600 rounded-full {animate ? 'animate-pulse' : ''}"
    style="width: {width}; height: {height};"
    role="img"
    aria-label="Loading profile..."
  ></div>

{:else if variant === "text"}
  <!-- Text lines skeleton -->
  <div class="space-y-2 {animate ? 'animate-pulse' : ''}" role="img" aria-label="Loading text content...">
    {#each Array(lines) as _, i}
      <div class="bg-gray-600 rounded h-4 {i === lines - 1 ? 'w-3/4' : 'w-full'}"></div>
    {/each}
  </div>

{:else if variant === "image"}
  <!-- Image-specific skeleton with animated dots -->
  <div 
    class="bg-gray-600 rounded-{rounded} flex items-center justify-center"
    style="width: {width}; height: {height}; min-height: {height};"
    role="img"
    aria-label="Loading image..."
  >
    <div class="flex space-x-1">
      <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms;"></div>
      <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms;"></div>
      <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms;"></div>
    </div>
  </div>

{:else}
  <!-- Default/fallback skeleton -->
  <div 
    class="bg-gray-600 rounded-{rounded} {animate ? 'animate-pulse' : ''}"
    style="width: {width}; height: {height}; min-height: {height};"
    role="img"
    aria-label="Loading..."
  ></div>
{/if}