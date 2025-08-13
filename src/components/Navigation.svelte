<!--
  Main navigation bar with authentication and responsive mobile menu
-->

<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { getLoginUrl, getLogoutUrl, getUserInitials } from '$lib/auth.client.js';
  import Icon from '@iconify/svelte';
  
  let { user = null } = $props();
  
  let mobileMenuOpen = $state(false);
  
  let currentPath = $derived($page.url.pathname);
  
  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }
  
  function closeMobileMenu() {
    mobileMenuOpen = false;
  }
  
  function handleLogin() {
    goto(getLoginUrl());
  }
  
  function handleLogout() {
    goto(getLogoutUrl());
  }
  
  function isActivePath(path) {
    return currentPath === path || (path !== '/' && currentPath.startsWith(path));
  }
  
  const navItems = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/search', label: 'Search', icon: 'search' },
    { path: '/request', label: 'Request', icon: 'plus' }
  ];
  
  const userNavItems = [
    { path: '/profile', label: 'Profile', icon: 'user' }
  ];
</script>

<nav class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">
      <!-- Logo and main navigation -->
      <div class="flex">
        <!-- Logo -->
        <div class="flex-shrink-0 flex items-center">
          <button
            type="button"
            onclick={() => goto('/')}
            class="text-xl font-bold text-gray-900 dark:text-white bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md"
            aria-label="Navigate to Home"
          >
            🎮 GG.Requestz
          </button>
        </div>
        
        <!-- Desktop navigation -->
        <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
          {#each navItems as item}
            <button
              type="button"
              onclick={() => goto(item.path)}
              class="inline-flex items-center px-1 pt-1 text-sm font-medium border-b-2 transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-0"
              class:border-blue-500={isActivePath(item.path)}
              class:text-gray-900={isActivePath(item.path)}
              class:dark:text-white={isActivePath(item.path)}
              class:border-transparent={!isActivePath(item.path)}
              class:text-gray-500={!isActivePath(item.path)}
              class:hover:text-gray-700={!isActivePath(item.path)}
              class:dark:text-gray-400={!isActivePath(item.path)}
              class:dark:hover:text-gray-300={!isActivePath(item.path)}
              aria-label="Navigate to {item.label}"
            >
              <!-- Icons -->
              {#if item.icon === 'home'}
                <Icon icon="heroicons:home" class="w-4 h-4 mr-2" />
              {:else if item.icon === 'search'}
                <Icon icon="heroicons:magnifying-glass" class="w-4 h-4 mr-2" />
              {:else if item.icon === 'plus'}
                <Icon icon="heroicons:plus" class="w-4 h-4 mr-2" />
              {/if}
              {item.label}
            </button>
          {/each}
        </div>
      </div>
      
      <!-- User menu and mobile menu button -->
      <div class="flex items-center">
        {#if user}
          <!-- User authenticated -->
          <div class="hidden sm:ml-4 sm:flex sm:items-center sm:space-x-4">
            {#each userNavItems as item}
              <button
                type="button"
                onclick={() => goto(item.path)}
                class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                class:text-gray-900={isActivePath(item.path)}
                class:dark:text-white={isActivePath(item.path)}
                aria-label="Navigate to {item.label}"
              >
                <Icon icon="heroicons:user" class="w-4 h-4 inline mr-1" />
                {item.label}
              </button>
            {/each}
            
            <!-- User dropdown -->
            <div class="relative">
              <button
                type="button"
                class="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors"
                aria-label="User menu"
              >
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <span class="text-white text-sm font-medium">
                    {getUserInitials(user)}
                  </span>
                </div>
              </button>
            </div>
            
            <button
              onclick={handleLogout}
              class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        {:else}
          <!-- User not authenticated -->
          <div class="hidden sm:flex sm:items-center">
            <button
              onclick={handleLogin}
              class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Login
            </button>
          </div>
        {/if}
        
        <!-- Mobile menu button -->
        <div class="sm:hidden ml-4">
          <button
            type="button"
            onclick={toggleMobileMenu}
            class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-2 transition-colors"
            aria-label="Toggle mobile menu"
          >
            {#if mobileMenuOpen}
              <Icon icon="heroicons:x-mark" class="w-6 h-6" />
            {:else}
              <Icon icon="heroicons:bars-3" class="w-6 h-6" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Mobile menu -->
  {#if mobileMenuOpen}
    <div class="sm:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div class="px-2 pt-2 pb-3 space-y-1">
        {#each navItems as item}
          <button
            type="button"
            onclick={() => { goto(item.path); closeMobileMenu(); }}
            class="block w-full text-left px-3 py-2 rounded-md text-base font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            class:bg-blue-50={isActivePath(item.path)}
            class:dark:bg-blue-900={isActivePath(item.path)}
            class:text-blue-700={isActivePath(item.path)}
            class:dark:text-blue-300={isActivePath(item.path)}
            class:text-gray-700={!isActivePath(item.path)}
            class:dark:text-gray-300={!isActivePath(item.path)}
            class:hover:bg-gray-50={!isActivePath(item.path)}
            class:dark:hover:bg-gray-700={!isActivePath(item.path)}
            aria-label="Navigate to {item.label}"
          >
            {item.label}
          </button>
        {/each}
        
        {#if user}
          {#each userNavItems as item}
            <button
              type="button"
              onclick={() => { goto(item.path); closeMobileMenu(); }}
              class="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Navigate to {item.label}"
            >
              {item.label}
            </button>
          {/each}
          
          <button
            onclick={() => { handleLogout(); closeMobileMenu(); }}
            class="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Logout
          </button>
        {:else}
          <button
            onclick={() => { handleLogin(); closeMobileMenu(); }}
            class="block w-full text-left px-3 py-2 rounded-md text-base font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Login
          </button>
        {/if}
      </div>
    </div>
  {/if}
</nav>