<!--
  Setup Completion Page - Final setup step with FOSS info and completion
-->

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import Icon from '@iconify/svelte';
  import { setupCompleteConfetti } from '$lib/confetti.js';

  let { data } = $props();
  let backgroundImage = $state('');
  let imageLoaded = $state(false);
  let loading = $state(false);

  // Load background image
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
          backgroundImage = randomGame.cover_url.replace('/t_thumb/', '/t_1080p/');
          
          const img = new Image();
          img.onload = () => { imageLoaded = true; };
          img.onerror = () => { imageLoaded = true; };
          img.src = backgroundImage;
        } else {
          imageLoaded = true;
        }
      } else {
        imageLoaded = true;
      }
    } catch (error) {
      imageLoaded = true;
    }

    // Trigger celebration confetti after a short delay
    setTimeout(() => {
      setupCompleteConfetti();
    }, 500);
  });

  async function goToLogin() {
    try {
      await invalidateAll();
      goto('/login');
    } catch (error) {
      console.error('Error during navigation:', error);
      loading = false;
    }
  }

  function handleStartClick() {
    loading = true;
    goToLogin();
  }
</script>

<svelte:head>
  <title>Setup Complete - G.G. Requestz</title>
</svelte:head>

<!-- Background Image -->
<div class="fixed inset-0 overflow-hidden">
  {#if backgroundImage && imageLoaded}
    <div 
      class="absolute inset-0 bg-cover bg-center bg-no-repeat transform scale-110 blur-sm"
      style="background-image: url('{backgroundImage}')"
    ></div>
  {/if}
  <div class="absolute inset-0 bg-black/60"></div>
  <div class="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-purple-900/30 to-pink-900/30"></div>
</div>

<!-- Loading overlay -->
{#if loading}
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
      <p class="text-white text-lg font-medium">Preparing your dashboard...</p>
      <p class="text-blue-100/70 text-sm mt-2">Please wait while we set up your experience</p>
    </div>
  </div>
{/if}

<!-- Main Content -->
<div class="relative min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-3xl">
    <!-- Background effects -->
    <div class="absolute inset-0 bg-gradient-to-r from-green-500/20 via-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl transform -rotate-1 animate-pulse"></div>
    
    <!-- Main card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-24 h-24 mb-6 flex items-center justify-center">
          <img src="/GGR_Logo.webp" alt="G.G. Requestz Logo" class="w-full h-full object-contain" />
        </div>
        
        <!-- Success Icon -->
        <div class="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
          <Icon icon="heroicons:check" class="w-10 h-10 text-green-400" />
        </div>
        
        <h1 class="text-4xl font-bold text-white mb-2">🎉 Setup Complete!</h1>
        <p class="text-xl text-green-100/90 mb-2">G.G. Requestz is ready to use</p>
        <p class="text-sm text-blue-200/70">Your game discovery platform has been successfully configured</p>
      </div>

      <!-- Success Message -->
      <div class="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-8">
        <div class="flex items-start space-x-3">
          <Icon icon="heroicons:check-circle" class="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 class="text-green-100 font-medium mb-2">Installation Successful</h3>
            <p class="text-green-200/80 text-sm mb-4">
              Your G.G. Requestz platform has been successfully set up with all required components. 
              Your admin account is ready and you can now start using all features.
            </p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">Database configured</span>
                </div>
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">IGDB API connected</span>
                </div>
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">Admin account created</span>
                </div>
              </div>
              <div class="space-y-2">
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">Cache system ready</span>
                </div>
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">Search engine active</span>
                </div>
                <div class="flex items-center space-x-2">
                  <Icon icon="heroicons:check" class="w-4 h-4 text-green-400" />
                  <span class="text-sm text-green-100">Security configured</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FOSS Information -->
      <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mb-8">
        <div class="flex items-start space-x-3">
          <Icon icon="heroicons:heart" class="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 class="text-blue-100 font-medium mb-2">Free and Open Source Software</h3>
            <p class="text-blue-200/80 text-sm mb-4">
              G.G. Requestz is proud to be Free and Open Source Software (FOSS). This means:
            </p>
            
            <ul class="space-y-2 text-sm text-blue-200/80 mb-4">
              <li class="flex items-start space-x-2">
                <Icon icon="heroicons:code-bracket" class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>Source code is freely available and can be modified</span>
              </li>
              <li class="flex items-start space-x-2">
                <Icon icon="heroicons:users" class="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span>Community-driven development and support</span>
              </li>
              <li class="flex items-start space-x-2">
                <Icon icon="heroicons:shield-check" class="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span>No vendor lock-in or licensing restrictions</span>
              </li>
              <li class="flex items-start space-x-2">
                <Icon icon="heroicons:globe-alt" class="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>Transparent and secure by design</span>
              </li>
            </ul>

            <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <div class="flex items-start space-x-2">
                <Icon icon="heroicons:exclamation-triangle" class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="text-yellow-100 font-medium text-sm mb-1">Important Disclaimer</p>
                  <p class="text-yellow-200/80 text-sm">
                    G.G. Requestz does not provide, host, or distribute any copyrighted game content. 
                    It is a discovery and request management platform only. Users are responsible 
                    for ensuring they comply with all applicable laws and licenses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Next Steps -->
      <div class="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6 mb-8">
        <div class="flex items-start space-x-3">
          <Icon icon="heroicons:rocket-launch" class="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 class="text-purple-100 font-medium mb-2">What's Next?</h3>
            <div class="space-y-3 text-sm text-purple-200/80">
              <div class="flex items-center space-x-2">
                <span class="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs font-bold text-purple-300">1</span>
                <span>Log in with your admin credentials and explore the dashboard</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs font-bold text-purple-300">2</span>
                <span>Configure additional users and permissions in the admin panel</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs font-bold text-purple-300">3</span>
                <span>Start discovering and requesting games using the search features</span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-xs font-bold text-purple-300">4</span>
                <span>Configure notifications and external services in admin settings</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Start Button -->
      <div class="text-center">
        <button
          type="button"
          onclick={handleStartClick}
          disabled={loading}
          class="px-8 py-4 bg-gradient-to-r from-green-600 via-blue-600 to-purple-600
                 hover:from-green-700 hover:via-blue-700 hover:to-purple-700
                 disabled:opacity-50 disabled:cursor-not-allowed
                 text-white font-bold rounded-xl transition-all duration-200
                 transform hover:scale-[1.02] shadow-2xl text-lg"
        >
          {#if loading}
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-white inline mr-3"></div>
            Starting...
          {:else}
            <Icon icon="heroicons:play" class="w-6 h-6 inline mr-3" />
            Start Using G.G. Requestz
          {/if}
        </button>
        
        <!-- Progress indicator -->
        <div class="mt-6 flex items-center justify-center space-x-2">
          <div class="w-3 h-3 bg-green-400 rounded-full"></div>
          <div class="w-3 h-3 bg-green-400 rounded-full"></div>
          <div class="w-3 h-3 bg-green-400 rounded-full"></div>
          <div class="w-3 h-3 bg-green-400 rounded-full"></div>
        </div>
        <p class="text-xs text-green-200/60 mt-2">Step 4 of 4: Complete! 🎉</p>
      </div>
    </div>
    
    <!-- Celebration effects -->
    <div class="absolute -top-8 -left-8 w-16 h-16 bg-gradient-to-r from-green-400/30 to-blue-500/30 rounded-full blur-xl animate-bounce" style="animation-duration: 2s;"></div>
    <div class="absolute -top-12 -right-12 w-20 h-20 bg-gradient-to-r from-purple-400/20 to-pink-500/20 rounded-full blur-2xl animate-pulse" style="animation-delay: 0.5s;"></div>
    <div class="absolute -bottom-8 -right-6 w-24 h-24 bg-gradient-to-r from-yellow-400/30 to-red-500/30 rounded-full blur-xl animate-bounce" style="animation-delay: 1s; animation-duration: 3s;"></div>
    <div class="absolute -bottom-12 -left-8 w-18 h-18 bg-gradient-to-r from-cyan-400/20 to-blue-500/20 rounded-full blur-xl animate-pulse" style="animation-delay: 1.5s;"></div>
  </div>
</div>