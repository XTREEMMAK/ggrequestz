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
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let { data, children } = $props();
  let user = $derived(data?.user);
  let userPermissions = $derived(data?.userPermissions || []);
  let currentPath = $derived($page.url.pathname);
  let appVersion = $state(null);
  let sidebarCollapsed = $state($sidebarCollapsedStore);
  let userMenuOpen = $state(false);
  let mobileSidebarOpen = $state(false);

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
      href: '/admin/api-keys',
      label: 'API Keys',
      icon: 'heroicons:key',
      permission: 'admin.panel'
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

  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
  }

  function toggleMobileSidebar() {
    mobileSidebarOpen = !mobileSidebarOpen;
  }

  function closeMobileSidebar() {
    mobileSidebarOpen = false;
  }

  // Close menus when clicking outside
  function handleClickOutside(event) {
    if (userMenuOpen && !event.target.closest('.user-menu-container')) {
      userMenuOpen = false;
    }
  }
  
</script>

<svelte:head>
  <title>Admin Panel - G.G Requestz</title>
  <meta name="description" content="Administrative interface for managing game requests and users." />
</svelte:head>

{#if hasAdminAccess}
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 relative z-[100]" data-admin-page onclick={handleClickOutside}>
    <!-- Mobile sidebar backdrop -->
    {#if mobileSidebarOpen}
      <div
        class="fixed inset-0 z-[55] lg:hidden bg-gray-600 opacity-75"
        onclick={closeMobileSidebar}
      ></div>
    {/if}
    
    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 z-[60] bg-white dark:bg-gray-800 shadow-lg transform transition-all duration-300 ease-in-out {mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 {sidebarCollapsed ? 'w-16' : 'w-64'}" id="sidebar">
      <div class="flex flex-col h-full">
        <!-- Logo/Header -->
        <div class="flex items-center justify-between h-16 bg-blue-600 dark:bg-blue-700 {sidebarCollapsed ? 'px-2' : 'px-6'}">
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
            <button
              type="button"
              onclick={toggleSidebarCollapse}
              class="w-full flex items-center justify-center hover:bg-blue-700 transition-colors rounded p-2 group gap-1"
              aria-label="Expand sidebar"
            >
              <div class="w-7 h-7 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
                <span class="text-blue-600 font-bold text-xs">GG</span>
              </div>
              <!-- Expand indicator -->
              <svg class="w-3 h-3 text-white opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          {/if}

          <!-- Desktop collapse button -->
          {#if !sidebarCollapsed}
            <button
              type="button"
              class="hidden lg:block text-white hover:text-gray-200 ml-2"
              onclick={toggleSidebarCollapse}
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
            onclick={closeMobileSidebar}
          >
            <Icon icon="heroicons:x-mark" class="w-6 h-6" />
          </button>
        </div>
        
        <!-- Navigation -->
        <nav class="flex-1 overflow-y-auto overflow-x-hidden py-6">
          <div class="px-3 space-y-1">
            {#each navItems as item}
              <a
                href={item.href}
                onclick={closeMobileSidebar}
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
                <div class="flex items-center space-x-3 {sidebarCollapsed ? 'space-x-0 relative' : ''}">
                  <Icon icon={item.icon} class="{sidebarCollapsed ? 'w-6 h-6' : 'w-5 h-5'}" />
                  {#if !sidebarCollapsed}
                    <span>{item.label}</span>
                  {/if}

                  {#if sidebarCollapsed && item.badge && item.badge > 0}
                    <!-- Badge overlay for collapsed sidebar -->
                    <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center min-w-0 z-10">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
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
        
        <!-- User section with submenu -->
        <div class="border-t border-gray-200 dark:border-gray-700 p-4">
          {#if sidebarCollapsed}
            <!-- Collapsed sidebar: Profile button with submenu -->
            <div class="relative user-menu-container">
              <button
                onclick={toggleUserMenu}
                class="w-full flex flex-col items-center space-y-2 p-2 rounded-lg"
                aria-label="User menu"
              >
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white text-sm font-medium">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
              </button>

              <!-- Submenu for collapsed sidebar -->
              {#if userMenuOpen}
                <div
                  class="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg w-48 z-50"
                  transition:slide={{ duration: 200, easing: cubicOut }}
                >
                  <div class="p-2">
                    <div class="px-3 py-2 border-b border-gray-700 mb-2">
                      <p class="text-sm font-medium text-white truncate">
                        {user?.name || user?.preferred_username || 'Admin'}
                      </p>
                      <p class="text-xs text-gray-400 truncate">{user?.email}</p>
                      {#if appVersion}
                        <p class="text-xs text-gray-500 mt-1">v{appVersion}</p>
                      {/if}
                    </div>
                    <a
                      href="/profile"
                      class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
                    >
                      Profile
                    </a>
                    <a
                      href="/"
                      class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
                    >
                      Main Site
                    </a>
                    <a
                      href="/api/auth/logout"
                      class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
                    >
                      Logout
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Expanded sidebar: Profile button with submenu -->
            <div class="relative user-menu-container">
              <button
                onclick={toggleUserMenu}
                class="w-full flex items-center space-x-3 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors mb-2"
                aria-label="User menu"
              >
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white text-sm font-medium">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div class="flex-1 min-w-0 text-left">
                  <p class="text-sm font-medium text-white truncate">
                    {user?.name || user?.preferred_username || 'Admin'}
                  </p>
                  <p class="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <svg class="w-4 h-4 text-gray-400 transition-transform duration-200 {userMenuOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
                </svg>
              </button>

              <!-- Submenu for expanded sidebar -->
              {#if userMenuOpen}
                <div
                  class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-2"
                  transition:slide={{ duration: 200, easing: cubicOut }}
                >
                  {#if appVersion}
                    <div class="px-3 py-2 border-b border-gray-700 text-center">
                      <p class="text-xs text-gray-500">v{appVersion}</p>
                    </div>
                  {/if}
                  <a
                    href="/profile"
                    class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Profile
                  </a>
                  <a
                    href="/"
                    class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Main Site
                  </a>
                  <a
                    href="/api/auth/logout"
                    class="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Logout
                  </a>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
    

    <!-- Main content -->
    <div class="{sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'} transition-all duration-300">
      <!-- Mobile header for admin -->
      <div class="lg:hidden fixed top-0 left-0 right-0 z-[50] bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between h-16 px-4">
          <!-- Mobile menu button -->
          <button
            type="button"
            class="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            onclick={toggleMobileSidebar}
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
      <div class="hidden lg:block sticky top-0 z-[50] bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
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
              {:else if currentPath.includes('/api-keys')}
                API Keys
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
      <main class="flex-1 w-full max-w-none mt-[50px] lg:mt-0">
        <div class="p-3 sm:p-4 md:p-6 w-full max-w-none min-w-0 overflow-x-auto">
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