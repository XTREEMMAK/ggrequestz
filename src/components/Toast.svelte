<script>
  import { toasts } from '$lib/stores/toast.js';
  import { fade, fly } from 'svelte/transition';
  import Icon from '@iconify/svelte';
  
  function getIcon(type) {
    switch(type) {
      case 'success': return 'heroicons:check-circle';
      case 'error': return 'heroicons:x-circle';
      case 'warning': return 'heroicons:exclamation-triangle';
      default: return 'heroicons:information-circle';
    }
  }
  
  function getClasses(type) {
    switch(type) {
      case 'success': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      case 'warning': return 'bg-yellow-600';
      default: return 'bg-blue-600';
    }
  }
</script>

<div class="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      transition:fly={{ y: 100, duration: 300 }}
      class="pointer-events-auto max-w-sm"
    >
      <div class="{getClasses(toast.type)} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3">
        <Icon icon={getIcon(toast.type)} class="w-5 h-5 flex-shrink-0" />
        <p class="text-sm font-medium">{toast.message}</p>
        <button
          onclick={() => toasts.remove(toast.id)}
          class="ml-auto pl-3 hover:opacity-80 transition-opacity"
        >
          <Icon icon="heroicons:x-mark" class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/each}
</div>