<!--
  Admin analytics dashboard
-->

<script>
  import { formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let overview = $derived(data?.overview || {});
  let charts = $derived(data?.charts || {});
  
  // Helper function to get status color
  function getStatusColor(status) {
    const colors = {
      pending: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      fulfilled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  
  // Helper function to format large numbers
  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }
  
  // Helper function to get trend direction
  function getTrendDirection(current, previous) {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  }
</script>

<svelte:head>
  <title>Analytics - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Analytics Dashboard
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        System insights and performance metrics
      </p>
    </div>
    
    <div class="text-sm text-gray-500 dark:text-gray-400">
      Last updated: {formatDate(new Date())}
    </div>
  </div>

  <!-- Overview metrics -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
    <!-- Total Requests -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Total Requests
          </p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatNumber(overview.totalRequests)}
          </p>
        </div>
        <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
          <Icon icon="heroicons:clipboard-document-list" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
      </div>
    </div>

    <!-- Pending Requests -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Pending Requests
          </p>
          <p class="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
            {formatNumber(overview.pendingRequests)}
          </p>
        </div>
        <div class="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
          <Icon icon="heroicons:clock" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
      </div>
    </div>

    <!-- Approval Rate -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Approval Rate
          </p>
          <p class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {overview.approvalRate}%
          </p>
        </div>
        <div class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
          <Icon icon="heroicons:check-circle" class="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
      </div>
    </div>

    <!-- Active Users -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Active Users
          </p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {formatNumber(overview.activeUsers)}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            of {overview.totalUsers} total
          </p>
        </div>
        <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
          <Icon icon="heroicons:users" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
      </div>
    </div>
  </div>

  <!-- Charts grid -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Status Distribution -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Request Status Distribution
        </h2>
      </div>
      
      <div class="p-6">
        {#if charts.statusDistribution.length > 0}
          <div class="space-y-4">
            {#each charts.statusDistribution as item}
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {getStatusColor(item.status)}">
                    {item.status}
                  </span>
                </div>
                <div class="text-sm font-medium text-gray-900 dark:text-white">
                  {item.count} ({overview.totalRequests > 0 ? Math.round((item.count / overview.totalRequests) * 100) : 0}%)
                </div>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  class="h-2 rounded-full"
                  class:bg-orange-500={item.status === 'pending'}
                  class:bg-green-500={item.status === 'approved'}
                  class:bg-blue-500={item.status === 'fulfilled'}
                  class:bg-red-500={item.status === 'rejected'}
                  class:bg-gray-500={item.status === 'cancelled'}
                  style="width: {overview.totalRequests > 0 ? (item.count / overview.totalRequests) * 100 : 0}%"
                ></div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center text-gray-500 dark:text-gray-400 py-8">
            <Icon icon="heroicons:chart-pie" class="w-12 h-12 mx-auto mb-4" />
            <p>No data available</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Activity Timeline -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Activity Timeline (30 Days)
        </h2>
      </div>
      
      <div class="p-6">
        {#if charts.timeline.length > 0}
          <div class="space-y-2">
            {#each charts.timeline.slice(0, 10) as day}
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">
                  {formatDate(day.date)}
                </span>
                <div class="flex items-center space-x-4">
                  <span class="text-blue-600 dark:text-blue-400">
                    {day.requests} requests
                  </span>
                  <span class="text-green-600 dark:text-green-400">
                    {day.users} users
                  </span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center text-gray-500 dark:text-gray-400 py-8">
            <Icon icon="heroicons:chart-bar" class="w-12 h-12 mx-auto mb-4" />
            <p>No timeline data available</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Top Users -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Most Active Users
        </h2>
      </div>
      
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each charts.topUsers as user, index}
          <div class="p-4 flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-sm font-medium">
                {index + 1}
              </span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {user.name}
              </span>
            </div>
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {user.requests} requests
            </span>
          </div>
        {:else}
          <div class="p-8 text-center text-gray-500 dark:text-gray-400">
            <Icon icon="heroicons:user-group" class="w-12 h-12 mx-auto mb-4" />
            <p>No user data available</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Popular Platforms -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Popular Platforms
        </h2>
      </div>
      
      <div class="p-6">
        {#if charts.popularPlatforms.length > 0}
          <div class="space-y-4">
            {#each charts.popularPlatforms as platform}
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900 dark:text-white">
                  {platform.platform}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {platform.count} requests
                </span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  class="bg-blue-500 h-2 rounded-full"
                  style="width: {charts.popularPlatforms.length > 0 ? (platform.count / charts.popularPlatforms[0].count) * 100 : 0}%"
                ></div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center text-gray-500 dark:text-gray-400 py-8">
            <Icon icon="heroicons:device-phone-mobile" class="w-12 h-12 mx-auto mb-4" />
            <p>No platform data available</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>