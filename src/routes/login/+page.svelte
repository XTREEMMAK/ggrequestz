<!--
  Login page with IGDB background covers and modern gradient design
-->

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import Icon from '@iconify/svelte';

  let { data } = $props();
  
  let backgroundImage = $state('');
  let imageLoaded = $state(false);
  let loading = $state(false);
  let user = $derived(data?.user);
  
  // If user is already logged in, redirect to homepage
  $effect(() => {
    if (user) {
      goto('/', { replaceState: true });
    }
  });
  
  // Load random IGDB cover on mount
  onMount(async () => {
    try {
      const response = await fetch('/api/games/popular?limit=20');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const games = await response.json();
      
      // Filter games with high quality cover images
      const gamesWithCovers = games.filter(game => 
        game.cover_url && 
        !game.cover_url.includes('nocover') &&
        game.cover_url.includes('igdb.com')
      );
      
      
      if (gamesWithCovers.length > 0) {
        const randomGame = gamesWithCovers[Math.floor(Math.random() * gamesWithCovers.length)];
        // Convert to high resolution version
        let highResUrl = randomGame.cover_url;
        if (highResUrl.includes('/t_thumb/')) {
          highResUrl = randomGame.cover_url.replace('/t_thumb/', '/t_1080p/');
        } else if (highResUrl.includes('/t_cover_small/')) {
          highResUrl = randomGame.cover_url.replace('/t_cover_small/', '/t_1080p/');
        }
        
        backgroundImage = highResUrl;
        
        // Preload image
        const img = new Image();
        img.onload = () => {
          imageLoaded = true;
        };
        img.onerror = () => {
          console.error('Failed to load background image');
          imageLoaded = true; // Show page anyway
        };
        img.src = highResUrl;
      } else {
        imageLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load background image:', error);
      imageLoaded = true; // Show page anyway
    }
  });
  
  function handleAuthentikLogin() {
    loading = true;
    window.location.href = '/api/auth/login';
  }
  
  function handleBasicLogin() {
    goto('/login/basic');
  }
</script>

<svelte:head>
  <title>Login - GameRequest</title>
  <meta name="description" content="Login to GameRequest - Game Discovery & Request Platform" />
</svelte:head>

<!-- Background Image -->
<div class="fixed inset-0 overflow-hidden">
  {#if backgroundImage && imageLoaded}
    <div 
      class="absolute inset-0 bg-cover bg-center bg-no-repeat transform scale-110 blur-sm"
      style="background-image: url('{backgroundImage}')"
    ></div>
  {/if}
  
  <!-- Dark overlay -->
  <div class="absolute inset-0 bg-black/60"></div>
  
  <!-- Gradient overlay -->
  <div class="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-pink-900/30"></div>
</div>

<!-- Main Content -->
<div class="relative min-h-screen flex items-center justify-center p-4">
  <!-- Login Card -->
  <div class="w-full max-w-md">
    <!-- Multi-layered shiny gradient backgrounds -->
    <div class="absolute inset-0 bg-gradient-to-r from-pink-500/30 via-purple-500/30 via-blue-500/30 to-cyan-500/30 rounded-3xl blur-2xl transform -rotate-2 animate-pulse"></div>
    <div class="absolute inset-0 bg-gradient-to-l from-yellow-400/20 via-red-500/20 via-purple-600/20 to-indigo-600/20 rounded-3xl blur-xl transform rotate-1" style="animation: shimmer 3s ease-in-out infinite alternate;"></div>
    <div class="absolute inset-0 bg-gradient-to-br from-emerald-400/25 via-blue-500/25 to-purple-600/25 rounded-3xl blur-lg transform -rotate-1" style="animation: shimmer 4s ease-in-out infinite alternate-reverse;"></div>
    
    <!-- Login card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl login-card-glow">
      <!-- Logo and Title -->
      <div class="text-center mb-8">
        <div class="mx-auto w-24 h-24 mb-4 flex items-center justify-center rounded-full shadow-2xl overflow-hidden">
          <img 
            src="/GGR_Logo.webp" 
            alt="GameRequest Logo" 
            class="w-full h-full object-contain"
          />
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">GameRequest</h1>
        <p class="text-blue-100/80 text-sm">Game Discovery & Request Platform</p>
      </div>
      
      <!-- Login Options -->
      <div class="space-y-4">
        {#if data?.isAuthentikEnabled}
          <!-- Authentik Login -->
          <button
            type="button"
            onclick={handleAuthentikLogin}
            disabled={loading}
            class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 
                   text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]
                   shadow-lg hover:shadow-blue-500/25 border border-blue-500/30"
          >
            {#if loading}
              <LoadingSpinner size="sm" />
              <span class="ml-2">Connecting...</span>
            {:else}
              <Icon icon="heroicons:key" class="w-5 h-5 inline mr-2" />
              Login with Authentik
            {/if}
          </button>
        {/if}
        
        {#if data?.isBasicAuthEnabled}
          <!-- Basic Auth Login -->
          <button
            type="button"
            onclick={handleBasicLogin}
            class="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 
                   text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200
                   transform hover:scale-[1.02] shadow-lg hover:shadow-gray-500/25 border border-gray-500/30"
          >
            <Icon icon="heroicons:user" class="w-5 h-5 inline mr-2" />
            Login with Username/Password
          </button>
        {/if}
        
        {#if !data?.isAuthentikEnabled && !data?.isBasicAuthEnabled}
          <div class="text-center text-red-200 bg-red-900/20 border border-red-500/30 rounded-xl p-4">
            <Icon icon="heroicons:exclamation-triangle" class="w-6 h-6 mx-auto mb-2" />
            <p class="text-sm">No authentication methods are configured.</p>
          </div>
        {/if}
      </div>
      
      <!-- Footer -->
      <div class="mt-8 text-center">
        <p class="text-xs text-blue-100/60">
          Secure authentication powered by industry-standard protocols
        </p>
      </div>
    </div>
    
    <!-- Enhanced floating elements for visual effect -->
    <div class="absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-r from-pink-400/20 to-purple-500/20 rounded-full blur-xl animate-bounce" style="animation-duration: 3s;"></div>
    <div class="absolute -top-12 -right-12 w-20 h-20 bg-gradient-to-r from-blue-400/15 to-cyan-500/15 rounded-full blur-2xl animate-pulse" style="animation-delay: 1.5s;"></div>
    <div class="absolute -bottom-8 -right-6 w-24 h-24 bg-gradient-to-r from-yellow-400/20 to-red-500/20 rounded-full blur-xl animate-bounce" style="animation-delay: 2s; animation-duration: 4s;"></div>
    <div class="absolute -bottom-12 -left-8 w-18 h-18 bg-gradient-to-r from-emerald-400/15 to-blue-500/15 rounded-full blur-xl animate-pulse" style="animation-delay: 0.5s;"></div>
  </div>
</div>

<!-- Loading state overlay -->
{#if !imageLoaded && backgroundImage}
  <div class="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
    <LoadingSpinner size="lg" text="Loading..." />
  </div>
{/if}

<style>
  :global(body) {
    overflow-x: hidden;
  }
  
  @keyframes shimmer {
    0% {
      opacity: 0.5;
      transform: scale(1) rotate(1deg);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05) rotate(-0.5deg);
    }
    100% {
      opacity: 0.6;
      transform: scale(1.02) rotate(0.5deg);
    }
  }
  
  /* Additional glow effect */
  .login-card-glow {
    box-shadow: 
      0 0 60px rgba(168, 85, 247, 0.15),
      0 0 120px rgba(59, 130, 246, 0.1),
      0 0 180px rgba(236, 72, 153, 0.05);
  }
</style>