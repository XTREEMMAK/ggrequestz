<!--
  Setup System Checks Page - Test all service connections
-->

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '@iconify/svelte';

  let { data } = $props();
  let backgroundImage = $state('');
  let imageLoaded = $state(false);
  let checks = $state([
    { 
      name: 'Database Connection', 
      description: 'PostgreSQL database connectivity',
      status: 'pending', 
      required: true, 
      error: null,
      icon: 'heroicons:circle-stack'
    },
    { 
      name: 'Redis Cache', 
      description: 'Redis caching server (optional - falls back to memory)',
      status: 'pending', 
      required: false, 
      error: null,
      icon: 'heroicons:server'
    },
    { 
      name: 'IGDB API', 
      description: 'Internet Game Database API access',
      status: 'pending', 
      required: true, 
      error: null,
      icon: 'heroicons:globe-alt'
    },
    { 
      name: 'ROMM Library', 
      description: 'Game library integration (optional)',
      status: 'pending', 
      required: false, 
      error: null,
      icon: 'heroicons:folder'
    }
  ]);
  
  let allChecksComplete = $state(false);
  let requiredChecksPassed = $state(false);
  let testing = $state(false);

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

    // Auto-start checks after a brief delay
    setTimeout(runAllChecks, 1000);
  });

  async function runAllChecks() {
    if (testing) return;
    testing = true;

    for (let i = 0; i < checks.length; i++) {
      checks[i].status = 'testing';
      await runSingleCheck(checks[i]);
      // Small delay between checks for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    testing = false;
    allChecksComplete = true;
    
    // Check if all required checks passed
    const requiredChecks = checks.filter(check => check.required);
    requiredChecksPassed = requiredChecks.every(check => check.status === 'success');
  }

  async function runSingleCheck(check) {
    try {
      const serviceName = check.name.toLowerCase().replace(/\s+/g, '_');
      
      const response = await fetch('/api/setup/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceName })
      });

      const result = await response.json();
      
      if (result.success) {
        if (result.warning) {
          check.status = 'warning';
          check.error = result.warning;
        } else {
          check.status = 'success';
          check.error = null;
        }
      } else {
        check.status = check.required ? 'error' : 'warning';
        check.error = result.error || 'Connection failed';
      }
    } catch (error) {
      check.status = check.required ? 'error' : 'warning';
      check.error = error.message || 'Connection failed';
    }
  }

  async function retryCheck(index) {
    if (testing) return;
    
    const check = checks[index];
    check.status = 'testing';
    await runSingleCheck(check);
    
    // Update overall status
    const requiredChecks = checks.filter(check => check.required);
    requiredChecksPassed = requiredChecks.every(check => check.status === 'success');
  }

  function continueSetup() {
    if (requiredChecksPassed) {
      goto('/setup/admin');
    }
  }

  function goBack() {
    goto('/setup');
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'success': return 'heroicons:check-circle';
      case 'error': return 'heroicons:x-circle';
      case 'warning': return 'heroicons:exclamation-triangle';
      case 'testing': return 'heroicons:arrow-path';
      default: return 'heroicons:clock';
    }
  }

  function getStatusColor(status, required) {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return required ? 'text-red-400' : 'text-yellow-400';
      case 'warning': return 'text-yellow-400';
      case 'testing': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  }
</script>

<svelte:head>
  <title>System Checks - G.G. Requestz Setup</title>
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

<!-- Main Content -->
<div class="relative min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-3xl">
    <!-- Background effects -->
    <div class="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl transform -rotate-1 animate-pulse"></div>
    
    <!-- Main card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-20 h-20 mb-4 flex items-center justify-center">
          <img src="/GGR_Logo.webp" alt="G.G. Requestz Logo" class="w-full h-full object-contain" />
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">System Checks</h1>
        <p class="text-blue-100/80">Verifying system connections and requirements</p>
      </div>

      <!-- Checks List -->
      <div class="space-y-4 mb-8">
        {#each checks as check, index}
          <div class="bg-white/5 rounded-xl p-4 border border-white/10">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-4 flex-1">
                <div class="flex items-center justify-center w-12 h-12 rounded-full bg-white/10">
                  <Icon icon={check.icon} class="w-6 h-6 text-blue-300" />
                </div>
                
                <div class="flex-1">
                  <div class="flex items-center space-x-2 mb-1">
                    <h3 class="text-white font-medium">{check.name}</h3>
                    {#if !check.required}
                      <span class="text-xs text-gray-400 bg-gray-500/20 px-2 py-0.5 rounded">optional</span>
                    {/if}
                  </div>
                  <p class="text-sm text-blue-100/70">{check.description}</p>
                  {#if check.error}
                    <p class="text-xs {check.status === 'warning' ? 'text-yellow-300' : 'text-red-300'} mt-1">
                      {check.status === 'warning' ? 'Warning' : 'Error'}: {check.error}
                    </p>
                  {/if}
                </div>
              </div>

              <div class="flex items-center space-x-3">
                <!-- Status Icon -->
                <div class="flex items-center justify-center w-8 h-8">
                  <Icon 
                    icon={getStatusIcon(check.status)} 
                    class="w-6 h-6 {getStatusColor(check.status, check.required)} {check.status === 'testing' ? 'animate-spin' : ''}" 
                  />
                </div>
                
                <!-- Retry Button -->
                {#if check.status === 'error' || check.status === 'warning'}
                  <button
                    type="button"
                    onclick={() => retryCheck(index)}
                    disabled={testing}
                    class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Retry
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Overall Status -->
      <div class="mb-8">
        {#if !allChecksComplete}
          <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <div class="flex items-center space-x-3">
              <Icon icon="heroicons:arrow-path" class="w-5 h-5 text-blue-400 animate-spin" />
              <div>
                <p class="text-blue-100 font-medium">Running System Checks...</p>
                <p class="text-blue-200/70 text-sm">Please wait while we verify your system configuration.</p>
              </div>
            </div>
          </div>
        {:else if requiredChecksPassed}
          <div class="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div class="flex items-center space-x-3">
              <Icon icon="heroicons:check-circle" class="w-5 h-5 text-green-400" />
              <div>
                <p class="text-green-100 font-medium">All Required Checks Passed!</p>
                <p class="text-green-200/70 text-sm">Your system is ready for G.G. Requestz. You can proceed to the next step.</p>
              </div>
            </div>
          </div>
        {:else}
          <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div class="flex items-center space-x-3">
              <Icon icon="heroicons:x-circle" class="w-5 h-5 text-red-400" />
              <div>
                <p class="text-red-100 font-medium">Required Checks Failed</p>
                <p class="text-red-200/70 text-sm">Please fix the required connection issues before continuing.</p>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-between">
        <button
          type="button"
          onclick={goBack}
          class="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
        >
          <Icon icon="heroicons:arrow-left" class="w-4 h-4 inline mr-2" />
          Back
        </button>

        <div class="flex items-center space-x-4">
          <button
            type="button"
            onclick={runAllChecks}
            disabled={testing}
            class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            <Icon icon="heroicons:arrow-path" class="w-4 h-4 inline mr-2" />
            Retry All
          </button>

          <button
            type="button"
            onclick={continueSetup}
            disabled={!requiredChecksPassed}
            class="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 
                   text-white font-medium rounded-xl transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue Setup
            <Icon icon="heroicons:arrow-right" class="w-4 h-4 inline ml-2" />
          </button>
        </div>
      </div>

      <!-- Progress indicator -->
      <div class="mt-6 flex items-center justify-center space-x-2">
        <div class="w-3 h-3 bg-green-400 rounded-full"></div>
        <div class="w-3 h-3 bg-blue-400 rounded-full"></div>
        <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
        <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
      </div>
      <p class="text-xs text-blue-200/60 mt-2 text-center">Step 2 of 4: System Checks</p>
    </div>
  </div>
</div>