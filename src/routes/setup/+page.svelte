<!--
  Setup Welcome Page - First-run introduction and welcome
-->

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '@iconify/svelte';

  let { data } = $props();
  let backgroundImage = $state('');
  let imageLoaded = $state(false);

  // Load random IGDB cover for background
  onMount(async () => {
    try {
      const response = await fetch('/api/games/popular?limit=20');
      if (response.ok) {
        const games = await response.json();
        const gamesWithCovers = games.filter(game => 
          game.cover_url && 
          !game.cover_url.includes('nocover') &&
          game.cover_url.includes('igdb.com')
        );
        
        if (gamesWithCovers.length > 0) {
          const randomGame = gamesWithCovers[Math.floor(Math.random() * gamesWithCovers.length)];
          let highResUrl = randomGame.cover_url.replace('/t_thumb/', '/t_1080p/');
          backgroundImage = highResUrl;
          
          const img = new Image();
          img.onload = () => { imageLoaded = true; };
          img.onerror = () => { imageLoaded = true; };
          img.src = highResUrl;
        } else {
          imageLoaded = true;
        }
      } else {
        imageLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load background:', error);
      imageLoaded = true;
    }
  });

  function continueSetup() {
    goto('/setup/checks');
  }
</script>

<svelte:head>
  <title>Welcome to G.G Requestz - First Run Setup</title>
  <meta name="description" content="Welcome to G.G Requestz - Game Discovery & Request Platform Setup" />
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
  <div class="w-full max-w-2xl">
    <!-- Multi-layered shiny gradient backgrounds -->
    <div class="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl transform -rotate-1 animate-pulse"></div>
    <div class="absolute inset-0 bg-gradient-to-l from-yellow-400/15 via-red-500/15 via-purple-600/15 to-indigo-600/15 rounded-3xl blur-xl transform rotate-1" style="animation: shimmer 3s ease-in-out infinite alternate;"></div>
    
    <!-- Welcome card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl text-center">
      <!-- Logo and Title -->
      <div class="mb-8">
        <div class="mx-auto w-32 h-32 mb-6 flex items-center justify-center rounded-full shadow-2xl overflow-hidden">
          <img 
            src="/GGR_Logo.webp" 
            alt="GGR Logo" 
            class="w-full h-full object-contain"
          />
        </div>
        <h1 class="text-4xl font-bold text-white mb-4">Welcome to G.G Requestz!</h1>
        <p class="text-xl text-blue-100/90 mb-2">Game Discovery & Request Platform</p>
        <p class="text-sm text-blue-200/70">First-time setup wizard</p>
      </div>

      <!-- Welcome Content -->
      <div class="space-y-6 mb-8 text-left">
        <div class="bg-white/5 rounded-xl p-6 border border-white/10">
          <h2 class="text-2xl font-semibold text-white mb-4 text-center">🎮 What is G.G Requestz?</h2>
          <p class="text-blue-100/80 leading-relaxed mb-4">
            G.G Requestz is your ultimate game discovery and request platform, designed to help you find, 
            track, and request your favorite games with ease.
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div class="space-y-3">
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:magnifying-glass" class="w-5 h-5 text-blue-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">Advanced game search & discovery</span>
              </div>
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:plus-circle" class="w-5 h-5 text-green-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">Submit game requests with priorities</span>
              </div>
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:heart" class="w-5 h-5 text-red-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">Personal watchlist & favorites</span>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:user-group" class="w-5 h-5 text-purple-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">User management & roles</span>
              </div>
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:bell" class="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">Real-time notifications</span>
              </div>
              <div class="flex items-center space-x-3">
                <Icon icon="heroicons:chart-bar" class="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <span class="text-sm text-blue-100/80">Request tracking & analytics</span>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div class="flex items-start space-x-3">
            <Icon icon="heroicons:information-circle" class="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 class="text-amber-100 font-medium mb-1">First-Time Setup</h3>
              <p class="text-amber-200/80 text-sm">
                This setup wizard will guide you through configuring your GameRequest installation, 
                testing system connections, and creating your first admin account.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Continue Button -->
      <button
        type="button"
        onclick={continueSetup}
        class="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 
               text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200
               transform hover:scale-[1.02] shadow-xl hover:shadow-blue-500/25 border border-blue-500/30
               text-lg"
      >
        <Icon icon="heroicons:play" class="w-5 h-5 inline mr-2" />
        Start Setup Wizard
      </button>

      <!-- Progress indicator -->
      <div class="mt-6 flex items-center justify-center space-x-2">
        <div class="w-3 h-3 bg-blue-400 rounded-full"></div>
        <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
        <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
        <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
      </div>
      <p class="text-xs text-blue-200/60 mt-2">Step 1 of 4: Welcome</p>
    </div>
    
    <!-- Floating elements for visual effect -->
    <div class="absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-r from-pink-400/20 to-purple-500/20 rounded-full blur-xl animate-bounce" style="animation-duration: 3s;"></div>
    <div class="absolute -top-12 -right-12 w-20 h-20 bg-gradient-to-r from-blue-400/15 to-cyan-500/15 rounded-full blur-2xl animate-pulse" style="animation-delay: 1.5s;"></div>
    <div class="absolute -bottom-8 -right-6 w-24 h-24 bg-gradient-to-r from-yellow-400/20 to-red-500/20 rounded-full blur-xl animate-bounce" style="animation-delay: 2s; animation-duration: 4s;"></div>
  </div>
</div>

<!-- Loading overlay -->
{#if !imageLoaded && backgroundImage}
  <div class="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
  </div>
{/if}

<style>
  @keyframes shimmer {
    0% {
      opacity: 0.3;
      transform: scale(1) rotate(1deg);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.02) rotate(-0.5deg);
    }
    100% {
      opacity: 0.4;
      transform: scale(1.01) rotate(0.5deg);
    }
  }
</style>