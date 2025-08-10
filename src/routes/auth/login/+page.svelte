<!--
  Basic Authentication Login Page
  Provides fallback login when Authentik is not available
-->

<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';

  let { data } = $props();

  let isLoading = false;
  let errorMessage = '';
  let showPassword = false;
  let urlParams = $derived($page.url.searchParams);

  // Form data
  let credentials = {
    username: '',
    password: ''
  };

  // Check for error in URL params
  onMount(() => {
    const error = urlParams.get('error');
    if (error) {
      errorMessage = decodeURIComponent(error);
    }

    // If user is already logged in, redirect to home
    if (data.user) {
      goto('/');
    }
  });

  const handleSubmit = async (event) => {
    isLoading = true;
    errorMessage = '';

    try {
      const formData = new FormData(event.target);
      const response = await fetch('/api/auth/basic/login', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        // Success - redirect to home or requested page
        const returnTo = urlParams.get('returnTo') || '/';
        goto(returnTo);
      } else {
        errorMessage = result.error || 'Login failed';
      }
    } catch (error) {
      errorMessage = 'Network error. Please try again.';
      console.error('Login error:', error);
    } finally {
      isLoading = false;
    }
  };
</script>

<svelte:head>
  <title>Login - GameRequest</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <!-- Logo/Header -->
    <div class="text-center">
      <h2 class="text-3xl font-bold text-gray-900 mb-2">🎮 GameRequest</h2>
      <p class="text-sm text-gray-600">Sign in to your account</p>
    </div>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
      <!-- Error Message -->
      {#if errorMessage}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Login Form -->
      <form on:submit|preventDefault={handleSubmit} class="space-y-6">
        <!-- Username/Email Field -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700">
            Username or Email
          </label>
          <div class="mt-1">
            <input
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              required
              bind:value={credentials.username}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="Enter your username or email"
            />
          </div>
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">
            Password
          </label>
          <div class="mt-1 relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autocomplete="current-password"
              required
              bind:value={credentials.password}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="Enter your password"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              on:click={() => showPassword = !showPassword}
            >
              <svg class="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {#if showPassword}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                {:else}
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                {/if}
              </svg>
            </button>
          </div>
        </div>

        <!-- Submit Button -->
        <div>
          <button
            type="submit"
            disabled={isLoading || !credentials.username || !credentials.password}
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {#if isLoading}
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            {:else}
              Sign in
            {/if}
          </button>
        </div>
      </form>

      <!-- Alternative Login Methods -->
      {#if data.authentikAvailable}
        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300" />
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <div class="mt-6">
            <a
              href="/api/auth/login"
              class="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-2 0V5H5v10h10v-1a1 1 0 112 0v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" clip-rule="evenodd" />
                <path fill-rule="evenodd" d="M12.293 9.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L13.586 13H7a1 1 0 110-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
              Single Sign-On (SSO)
            </a>
          </div>
        </div>
      {/if}

      <!-- Setup Link for Initial Admin -->
      {#if data.needsSetup}
        <div class="mt-6 text-center">
          <div class="text-sm">
            <p class="text-gray-600 mb-2">First time setup?</p>
            <a
              href="/auth/setup"
              class="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Create initial admin account
            </a>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Footer -->
  <div class="mt-8 text-center text-xs text-gray-500">
    <p>© 2024 GameRequest. Secure authentication with bcrypt.</p>
  </div>
</div>