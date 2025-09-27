<!--
  Admin panel layout with navigation and permission checks
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import Icon from '@iconify/svelte';
  import { sidebarCollapsed as sidebarCollapsedStore } from '$lib/stores/sidebar.js';
  
  let { data, children } = $props();
  let user = $derived(data?.user);
  let userPermissions = $derived(data?.userPermissions || []);
  let currentPath = $derived($page.url.pathname);
  let appVersion = $state(null);
  let sidebarCollapsed = $state($sidebarCollapsedStore);

  // Sync with store
  $effect(() => {
    sidebarCollapsedStore.set(sidebarCollapsed);
  });

  // Listen for store changes
  $effect(() => {
    sidebarCollapsed = $sidebarCollapsedStore;
  });
  
  // Check if user has admin panel access
  let hasAdminAccess = $derived(userPermissions.includes('admin.panel'));
  
  // Redirect non-admin users
  $effect(() => {
    if (!user) {
      goto('/api/auth/login');
    } else if (!hasAdminAccess) {
      goto('/?error=unauthorized');
    }
  });
  
  // Fetch app version
  onMount(() => {
    if (browser) {
      fetch('/api/version')
        .then(response => response.json())
        .then(data => {
          appVersion = data.version;
        })
        .catch(() => {
          // Silently fail - version display is not critical
        });
    }
  });
  
  // Navigation items with permission checks
  let navItems = $derived([
    {
      href: '/admin',
      label: 'Dashboard',
      icon: 'heroicons:home',
      permission: 'admin.panel'
    },
    {
      href: '/admin/requests',
      label: 'Requests',
      icon: 'heroicons:clipboard-document-list',
      permission: 'request.view_all',
      badge: data?.pendingRequestsCount || 0
    },
    {
      href: '/admin/users',
      label: 'Users',
      icon: 'heroicons:users',
      permission: 'user.view'
    },
    {
      href: '/admin/roles',
      label: 'Roles',
      icon: 'heroicons:shield-check',
      permission: 'user.edit'
    },
    {
      href: '/admin/navigation',
      label: 'Navigation',
      icon: 'heroicons:bars-3-bottom-left',
      permission: 'navigation.manage'
    },
    {
      href: '/admin/settings',
      label: 'Settings',
      icon: 'heroicons:cog-6-tooth',
      permission: 'system.settings'
    },
    {
      href: '/admin/analytics',
      label: 'Analytics',
      icon: 'heroicons:chart-bar',
      permission: 'analytics.view'
    }
  ].filter(item => userPermissions.includes(item.permission)));
  
  function isCurrentPath(href) {
    if (href === '/admin') {
      return currentPath === '/admin';
    }
    return currentPath.startsWith(href);
  }

  function toggleSidebarCollapse() {
    sidebarCollapsed = !sidebarCollapsed;
  }
  
</script>

<svelte:head>
  <title>Admin Panel - G.G Requestz</title>
  <meta name="description" content="Administrative interface for managing game requests and users." />
</svelte:head>

{#if hasAdminAccess}
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Mobile sidebar backdrop -->
    <div class="fixed inset-0 z-40 lg:hidden" id="mobile-sidebar-backdrop" style="display: none;">
      <div class="absolute inset-0 bg-gray-600 opacity-75"></div>
    </div>
    
    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 shadow-lg transform -translate-x-full lg:translate-x-0 transition-all duration-300 ease-in-out {sidebarCollapsed ? 'w-16' : 'w-64'}" id="sidebar">
      <div class="flex flex-col h-full">
        <!-- Logo/Header -->
        <div class="flex items-center justify-between h-16 px-6 bg-blue-600 dark:bg-blue-700">
          {#if !sidebarCollapsed}
            <a href="/admin" class="flex-1 flex items-center justify-center space-x-3">
              <img
                src="/GGR_Logo.webp"
                alt="G.G Requestz Admin Logo"
                class="h-10 w-auto filter brightness-0 invert"
              />
              <span class="text-white font-semibold text-lg">Admin</span>
            </a>
          {:else}
            <a href="/admin" class="flex-1 flex items-center justify-center">
              <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <span class="text-blue-600 font-bold text-sm">GG</span>
              </div>
            </a>
          {/if}

          <!-- Desktop collapse button -->
          {#if !sidebarCollapsed}
            <button
              type="button"
              class="hidden lg:block text-white hover:text-gray-200 ml-2"
              on:click={toggleSidebarCollapse}
              aria-label="Collapse sidebar"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
              </svg>
            </button>
          {/if}

          <!-- Mobile close button -->
          <button
            type="button"
            class="lg:hidden text-white hover:text-gray-200"
            on:click={() => document.getElementById('sidebar').classList.add('-translate-x-full')}
          >
            <Icon icon="heroicons:x-mark" class="w-6 h-6" />
          </button>
        </div>
        
        <!-- Navigation -->
        <nav class="flex-1 overflow-y-auto py-6">
          <div class="px-3 space-y-1">
            {#each navItems as item}
              <a
                href={item.href}
                class="flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors {sidebarCollapsed ? 'justify-center relative group' : ''}"
                class:bg-blue-100={isCurrentPath(item.href)}
                class:text-blue-700={isCurrentPath(item.href)}
                class:dark:bg-blue-900={isCurrentPath(item.href)}
                class:dark:text-blue-200={isCurrentPath(item.href)}
                class:text-gray-700={!isCurrentPath(item.href)}
                class:hover:bg-gray-100={!isCurrentPath(item.href)}
                class:dark:text-gray-300={!isCurrentPath(item.href)}
                class:dark:hover:bg-gray-700={!isCurrentPath(item.href)}
              >
                <div class="flex items-center space-x-3 {sidebarCollapsed ? 'space-x-0' : ''}">
                  <Icon icon={item.icon} class="{sidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'}" />
                  {#if !sidebarCollapsed}
                    <span>{item.label}</span>
                  {/if}
                </div>

                {#if !sidebarCollapsed && item.badge && item.badge > 0}
                  <span class="bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full dark:bg-red-900 dark:text-red-200">
                    {item.badge}
                  </span>
                {/if}

                {#if sidebarCollapsed}
                  <!-- Tooltip for collapsed sidebar -->
                  <div class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                    {#if item.badge && item.badge > 0}
                      ({item.badge})
                    {/if}
                  </div>
                {/if}
              </a>
            {/each}
          </div>
        </nav>
        
        <!-- User info -->
        <div class="border-t border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-center space-x-3 mb-2">
            <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span class="text-white text-sm font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.name || user?.preferred_username || 'Admin'}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          
          <!-- App Version -->
          {#if appVersion}
            <div class="mb-3 text-center">
              <p class="text-xs text-gray-500 dark:text-gray-400">v{appVersion}</p>
            </div>
          {/if}
          
          <div class="space-y-1">
            <a
              href="/profile"
              class="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Profile
            </a>
            <a
              href="/"
              class="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Main Site
            </a>
            <a
              href="/api/auth/logout"
              class="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Logout
            </a>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Floating expand button for collapsed sidebar -->
    {#if sidebarCollapsed}
      <button
        type="button"
        class="hidden lg:block fixed top-4 left-20 z-50 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-lg transition-all duration-200"
        on:click={toggleSidebarCollapse}
        aria-label="Expand sidebar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
        </svg>
      </button>
    {/if}

    <!-- Main content -->
    <div class="{sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'} transition-all duration-300">
      <!-- Mobile header for admin -->
      <div class="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between h-16 px-4">
          <!-- Mobile menu button -->
          <button
            type="button"
            class="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            on:click={() => document.getElementById('sidebar').classList.remove('-translate-x-full')}
          >
            <Icon icon="heroicons:bars-3" class="w-6 h-6" />
          </button>
          
          <!-- Admin title for mobile -->
          <div class="flex-1 text-center">
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Admin Panel</h1>
          </div>
          
          <!-- User avatar -->
          <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span class="text-white text-sm font-medium">
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Desktop top bar -->
      <div class="hidden lg:block sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between h-16 px-4 sm:px-6">
          
          <!-- Page title -->
          <div class="flex-1 lg:flex-none">
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
              {#if currentPath === '/admin'}
                Dashboard
              {:else if currentPath.includes('/requests')}
                Request Management
              {:else if currentPath.includes('/users')}
                User Management
              {:else if currentPath.includes('/roles')}
                Role Management
              {:else if currentPath.includes('/navigation')}
                Navigation Management
              {:else if currentPath.includes('/settings')}
                System Settings
              {:else if currentPath.includes('/analytics')}
                Analytics
              {:else}
                Admin Panel
              {/if}
            </h1>
          </div>
          
          <!-- Quick actions -->
          <div class="flex items-center space-x-4">
            <a
              href="/request"
              class="hidden sm:inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Icon icon="heroicons:plus" class="w-4 h-4 mr-1.5" />
              New Request
            </a>
          </div>
        </div>
      </div>
      
      <!-- Page content -->
      <main class="flex-1 w-full max-w-none pt-16 lg:pt-0">
        <div class="p-6 w-full max-w-none">
          {@render children()}
        </div>
      </main>
    </div>
  </div>
{:else}
  <!-- Loading or unauthorized -->
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
    <div class="text-center">
      <Icon icon="heroicons:lock-closed" class="w-16 h-16 mx-auto mb-4 text-gray-400" />
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Access Denied
      </h2>
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        You don't have permission to access the admin panel.
      </p>
      <a
        href="/"
        class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        Return to Homepage
      </a>
    </div>
  </div>
{/if}