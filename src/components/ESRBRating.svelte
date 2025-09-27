<!--
  ESRB Rating Component with Clean Text-Based Design
  Uses styled text badges for ESRB ratings
-->

<script>
  let { rating = null, size = 'md' } = $props();

  // Size configurations
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  // Get rating info
  let ratingInfo = $derived(getRatingInfo(rating));

  function getRatingInfo(rating) {
    const ratings = {
      'EC': {
        name: 'Early Childhood',
        description: 'Ages 3+',
        color: 'bg-green-50 text-green-700 border-green-200',
        textColor: 'text-green-800'
      },
      'E': {
        name: 'Everyone',
        description: 'Ages 6+',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        textColor: 'text-blue-800'
      },
      'E10+': {
        name: 'Everyone 10+',
        description: 'Ages 10+',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        textColor: 'text-indigo-800'
      },
      'T': {
        name: 'Teen',
        description: 'Ages 13+',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        textColor: 'text-yellow-800'
      },
      'M': {
        name: 'Mature 17+',
        description: 'Ages 17+',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        textColor: 'text-orange-800'
      },
      'AO': {
        name: 'Adults Only 18+',
        description: 'Ages 18+',
        color: 'bg-red-50 text-red-700 border-red-200',
        textColor: 'text-red-800'
      },
      'RP': {
        name: 'Rating Pending',
        description: 'Not yet rated',
        color: 'bg-gray-50 text-gray-700 border-gray-200',
        textColor: 'text-gray-800'
      }
    };
    return ratings[rating] || null;
  }
</script>

{#if rating && ratingInfo}
  <div class="inline-flex items-center gap-2">
    <!-- Clean ESRB Rating Badge -->
    <div
      class="{sizes[size]} {ratingInfo.color} relative overflow-hidden rounded-lg border-2 flex items-center justify-center font-bold shadow-sm"
      title="{ratingInfo.name} - {ratingInfo.description}"
    >
      <span class="font-black tracking-tight">
        {rating}
      </span>
    </div>

    <!-- Text label -->
    <span class="text-sm font-medium {ratingInfo.textColor} dark:text-gray-300">
      {ratingInfo.name}
    </span>
  </div>
{/if}

