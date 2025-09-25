<!--
  Basic authentication login page
-->

<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import Icon from '@iconify/svelte';
  import { fade } from 'svelte/transition';

  let { data, form } = $props();
  
  let loading = $state(false);
  let showPassword = $state(false);
  let user = $derived(data?.user);
  
  // If user is already logged in, redirect to homepage
  $effect(() => {
    if (user) {
      goto('/', { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>Login - G.G Requestz</title>
  <meta name="description" content="Login with username and password" />
</svelte:head>

<!-- Background -->
<div class="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center p-4">
  
  <!-- Full-page loading overlay -->
  {#if loading}
    <div 
      class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      transition:fade={{ duration: 300 }}
    >
      <div 
        class="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center"
        transition:fade={{ duration: 400, delay: 100 }}
      >
        <LoadingSpinner size="lg" />
        <p class="text-white mt-4 text-lg font-medium">Logging you in...</p>
        <p class="text-blue-100/70 text-sm mt-2">Please wait while we authenticate your credentials</p>
      </div>
    </div>
  {/if}
  
  <!-- Login Card -->
  <div class="w-full max-w-md">
    <!-- Glowing background effect -->
    <div class="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl transform rotate-1"></div>
    
    <!-- Login card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 mb-4 flex items-center justify-center bg-gradient-to-br from-gray-500 to-gray-600 rounded-full shadow-lg">
          <Icon icon="heroicons:user" class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-1">Login</h1>
        <p class="text-blue-100/80 text-sm">Enter your username and password</p>
      </div>
      
      <!-- Error Messages -->
      {#if form?.error}
        <div class="mb-6 bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
          <Icon icon="heroicons:exclamation-triangle" class="w-4 h-4 inline mr-2" />
          {form.error}
        </div>
      {/if}
      
      <!-- Login Form -->
      <form 
        method="POST" 
        action="?/login"
        use:enhance={() => {
          loading = true;
          return async ({ result, update }) => {
            // Only set loading to false if login failed (not redirecting)
            if (result.type === 'failure' || result.type === 'error') {
              loading = false;
            }
            await update();
            if (result.type === 'redirect') {
              goto(result.location || '/', { replaceState: true });
            }
          };
        }}
      >
        <div class="space-y-4">
          <!-- Username/Email -->
          <div>
            <label for="identifier" class="block text-sm font-medium text-blue-100/90 mb-2">
              Username or Email
            </label>
            <input
              type="text"
              id="identifier"
              name="identifier"
              required
              class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-blue-100/50 
                     focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              placeholder="Enter username or email"
              value={form?.identifier || ''}
            />
          </div>
          
          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-blue-100/90 mb-2">
              Password
            </label>
            <div class="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                required
                class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 pr-12 text-white placeholder-blue-100/50 
                       focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                placeholder="Enter password"
              />
              <button
                type="button"
                onclick={() => showPassword = !showPassword}
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-100/60 hover:text-white transition-colors"
              >
                <Icon icon={showPassword ? 'heroicons:eye-slash' : 'heroicons:eye'} class="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <!-- Login Button -->
          <button
            type="submit"
            disabled={loading}
            class="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 
                   text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200
                   disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]
                   shadow-lg hover:shadow-gray-500/25 border border-gray-500/30"
          >
            {#if loading}
              <LoadingSpinner size="sm" />
              <span class="ml-2">Logging in...</span>
            {:else}
              <Icon icon="heroicons:arrow-right-on-rectangle" class="w-5 h-5 inline mr-2" />
              Login
            {/if}
          </button>
        </div>
      </form>
      
      <!-- Registration Section -->
      {#if data?.registrationEnabled}
        <div class="mt-6 text-center">
          <p class="text-blue-100/70 text-sm mb-3">Don't have an account?</p>
          <a
            href="/register"
            class="w-full inline-flex items-center justify-center px-4 py-3
                   bg-gradient-to-r from-green-600 to-emerald-600
                   hover:from-green-700 hover:to-emerald-700
                   text-white font-semibold rounded-xl transition-all duration-200
                   transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
          >
            <Icon icon="heroicons:user-plus" class="w-5 h-5 mr-2" />
            Create New Account
          </a>
        </div>
      {/if}

      <!-- Back to main login -->
      <div class="mt-4 text-center">
        <a
          href="/login"
          class="text-blue-200/80 hover:text-white text-sm transition-colors inline-flex items-center"
        >
          <Icon icon="heroicons:arrow-left" class="w-4 h-4 mr-1" />
          Back to login options
        </a>
      </div>
    </div>
  </div>
</div>