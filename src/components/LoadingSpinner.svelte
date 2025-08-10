<!--
  Loading spinner component with customizable size and color
-->

<script>
  import Icon from '@iconify/svelte';
  
  let { size = 'md', color = 'blue', text = '' } = $props(); // 'xs', 'sm', 'md', 'lg', 'xl'
  
  let sizeClass = $derived(getSizeClass(size));
  let colorClass = $derived(getColorClass(color));
  
  function getSizeClass(size) {
    const sizeMap = {
      'xs': 'w-3 h-3',
      'sm': 'w-4 h-4',
      'md': 'w-6 h-6',
      'lg': 'w-8 h-8',
      'xl': 'w-12 h-12'
    };
    
    return sizeMap[size] || sizeMap.md;
  }
  
  function getColorClass(color) {
    const colorMap = {
      'blue': 'text-blue-600',
      'gray': 'text-gray-600', 
      'green': 'text-green-600',
      'purple': 'text-purple-600',
      'red': 'text-red-600'
    };
    
    return colorMap[color] || colorMap.blue;
  }
</script>

<div class="flex items-center justify-center space-x-2" role="status" aria-label="Loading">
  <Icon 
    icon="heroicons:arrow-path"
    class="animate-spin {sizeClass} {colorClass}"
  />
  
  {#if text}
    <span class="text-sm text-gray-600 dark:text-gray-400">{text}</span>
  {/if}
</div>