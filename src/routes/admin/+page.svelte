<!--
  Admin dashboard with overview statistics and quick actions
-->

<script>
  import { goto } from '$app/navigation';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import { formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let user = $derived(data?.user);
  let stats = $derived(data?.stats || {});
  let recentRequests = $derived(data?.recentRequests || []);
  let recentUsers = $derived(data?.recentUsers || []);
  let userPermissions = $derived(data?.userPermissions || []);
  
  // Quick stats cards
  let statsCards = $derived([
    {
      title: 'Total Requests',
      value: stats.totalRequests || 0,
      change: stats.requestsChange || 0,
      icon: 'clipboard',
      href: '/admin/requests'
    },
    {
      title: 'Pending Requests',
      value: stats.pendingRequests || 0,
      change: null,
      icon: 'clock',
      href: '/admin/requests?status=pending',
      urgent: true
    },
    {
      title: 'Active Users',
      value: stats.activeUsers || 0,
      change: stats.usersChange || 0,
      icon: 'users',
      href: '/admin/users'
    },
    {
      title: 'System Health',
      value: stats.systemHealth || 'Good',
      change: null,
      icon: 'shield',
      href: '/admin/settings'
    }
  ]);
  
  function getStatIcon(iconName) {
    const icons = {
      clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
      users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-2.703a6 6 0 00-3-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
    };
    return icons[iconName] || icons.shield;
  }
  
  function getChangeColor(change) {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-500';
  }
  
  function getChangeIcon(change) {
    if (change > 0) return 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6';
    if (change < 0) return 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6';
    return 'M5 12h14';
  }
</script>

<svelte:head>
  <title>Admin Dashboard - GameRequest</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Welcome header -->
  <div class="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-6 text-white">
    <h1 class="text-2xl font-bold mb-2">
      Welcome back, {user?.name || user?.preferred_username || 'Admin'}!
    </h1>
    <p class="text-blue-100">
      Here's what's happening with your game request system today.
    </p>
  </div>
  
  <!-- Stats grid - Responsive full width -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-6 gap-4 lg:gap-6">
    {#each statsCards as card}
      <a
        href={card.href}
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
        class:ring-2={card.urgent && card.value > 0}
        class:ring-orange-500={card.urgent && card.value > 0}
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
              {card.title}
            </p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {card.value}
            </p>
            {#if card.change !== null}
              <div class="flex items-center mt-2">
                <Icon icon={getChangeIcon(card.change)} class="w-4 h-4 {getChangeColor(card.change)}" />
                <span class="text-sm {getChangeColor(card.change)} ml-1">
                  {Math.abs(card.change)}% vs last month
                </span>
              </div>
            {/if}
          </div>
          <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <Icon icon={card.icon} class="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </a>
    {/each}
  </div>
  
  <!-- Content grid - Full width layout -->
  <div class="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
    <!-- Recent requests -->
    {#if userPermissions.includes('request.view_all')}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Requests
            </h2>
            <a
              href="/admin/requests"
              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              View all →
            </a>
          </div>
        </div>
        
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each recentRequests as request}
            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {request.title}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    by {request.user_name} • {formatDate(request.created_at)}
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <StatusBadge status={request.status} />
                  <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                    {request.request_type}
                  </span>
                </div>
              </div>
            </div>
          {:else}
            <div class="p-8 text-center text-gray-500 dark:text-gray-400">
              <Icon icon="heroicons:clipboard-document-list" class="w-12 h-12 mx-auto mb-4" />
              <p>No requests yet</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Recent users -->
    {#if userPermissions.includes('user.view')}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Users
            </h2>
            <a
              href="/admin/users"
              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              View all →
            </a>
          </div>
        </div>
        
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each recentUsers as user}
            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white text-sm font-medium">
                    {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user.name || user.preferred_username || 'User'}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user.email}
                  </p>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(user.created_at)}
                </div>
              </div>
            </div>
          {:else}
            <div class="p-8 text-center text-gray-500 dark:text-gray-400">
              <Icon icon="heroicons:users" class="w-12 h-12 mx-auto mb-4" />
              <p>No users yet</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Quick actions -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
      Quick Actions
    </h2>
    
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
      {#if userPermissions.includes('request.view_all')}
        <a
          href="/admin/requests?status=pending"
          class="flex items-center p-4 bg-orange-50 dark:bg-orange-900 border border-orange-200 dark:border-orange-700 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-800 transition-colors"
        >
          <Icon icon="heroicons:clock" class="w-8 h-8 text-orange-600 dark:text-orange-400 mr-3" />
          <div>
            <p class="font-medium text-orange-900 dark:text-orange-100">Review Pending</p>
            <p class="text-sm text-orange-700 dark:text-orange-300">Check new requests</p>
          </div>
        </a>
      {/if}
      
      {#if userPermissions.includes('user.view')}
        <a
          href="/admin/users"
          class="flex items-center p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
        >
          <Icon icon="heroicons:users" class="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
          <div>
            <p class="font-medium text-blue-900 dark:text-blue-100">Manage Users</p>
            <p class="text-sm text-blue-700 dark:text-blue-300">User administration</p>
          </div>
        </a>
      {/if}
      
      {#if userPermissions.includes('system.settings')}
        <a
          href="/admin/settings"
          class="flex items-center p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg hover:bg-green-100 dark:hover:bg-green-800 transition-colors"
        >
          <Icon icon="heroicons:cog-6-tooth" class="w-8 h-8 text-green-600 dark:text-green-400 mr-3" />
          <div>
            <p class="font-medium text-green-900 dark:text-green-100">System Settings</p>
            <p class="text-sm text-green-700 dark:text-green-300">Configure system</p>
          </div>
        </a>
      {/if}
      
      {#if userPermissions.includes('analytics.view')}
        <a
          href="/admin/analytics"
          class="flex items-center p-4 bg-purple-50 dark:bg-purple-900 border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors"
        >
          <Icon icon="heroicons:chart-bar" class="w-8 h-8 text-purple-600 dark:text-purple-400 mr-3" />
          <div>
            <p class="font-medium text-purple-900 dark:text-purple-100">View Analytics</p>
            <p class="text-sm text-purple-700 dark:text-purple-300">System insights</p>
          </div>
        </a>
      {/if}
    </div>
  </div>
</div>