<!--
  Basic authentication user registration page
-->

<script>
  import { goto } from '$app/navigation';
  import Icon from '@iconify/svelte';
  import { fade } from 'svelte/transition';

  let loading = $state(false);
  let showPassword = $state(false);
  let formData = $state({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  let errors = $state({});
  let success = $state(false);

  async function handleRegister() {
    if (loading) return;

    // Reset errors
    errors = {};

    // Client-side validation
    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (!/^[a-zA-Z0-9_]{3,50}$/.test(formData.username)) {
      errors.username = 'Username must be 3-50 characters and contain only letters, numbers, and underscores';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      return;
    }

    loading = true;

    try {
      const response = await fetch('/api/auth/basic/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        success = true;
        // Redirect to login after a short delay
        setTimeout(() => {
          goto('/login/basic?message=registration_success');
        }, 2000);
      } else {
        errors.general = result.error || 'Registration failed. Please try again.';
      }
    } catch (error) {
      console.error('Registration error:', error);
      errors.general = 'Network error. Please check your connection and try again.';
    } finally {
      loading = false;
    }
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }
</script>

<svelte:head>
  <title>Register - G.G Requestz</title>
  <meta name="description" content="Create a new account to start discovering and requesting games" />
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
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p class="text-white text-lg font-medium">Creating your account...</p>
        <p class="text-blue-100/70 text-sm mt-2">Please wait while we set up your profile</p>
      </div>
    </div>
  {/if}

  <!-- Registration Card -->
  <div class="w-full max-w-md">
    <!-- Glowing background effect -->
    <div class="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl transform rotate-1"></div>

    <!-- Registration card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 mb-4 flex items-center justify-center bg-gradient-to-br from-green-500 to-blue-600 rounded-full shadow-lg">
          <Icon icon="heroicons:user-plus" class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-1">Create Account</h1>
        <p class="text-blue-100/80 text-sm">Join G.G. Requestz to discover and request games</p>
      </div>

      <!-- Success Message -->
      {#if success}
        <div class="mb-6 bg-green-900/20 border border-green-500/30 rounded-xl p-4 text-green-200 text-sm text-center" transition:fade>
          <Icon icon="heroicons:check-circle" class="w-5 h-5 inline mr-2" />
          Account created successfully! Redirecting to login...
        </div>
      {:else}

        <!-- General Error Message -->
        {#if errors.general}
          <div class="mb-6 bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
            <Icon icon="heroicons:exclamation-triangle" class="w-4 h-4 inline mr-2" />
            {errors.general}
          </div>
        {/if}

        <!-- Registration Form -->
        <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
          <div class="space-y-4">
            <!-- Username -->
            <div>
              <label for="username" class="block text-sm font-medium text-blue-100/90 mb-2">
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                bind:value={formData.username}
                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl
                       text-white placeholder-gray-300 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent backdrop-blur-sm
                       {errors.username ? 'border-red-500/50 bg-red-900/10' : ''}"
                placeholder="Enter your username"
                disabled={loading || success}
                required
              />
              {#if errors.username}
                <p class="mt-1 text-sm text-red-300">{errors.username}</p>
              {/if}
            </div>

            <!-- Email -->
            <div>
              <label for="email" class="block text-sm font-medium text-blue-100/90 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                bind:value={formData.email}
                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl
                       text-white placeholder-gray-300 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent backdrop-blur-sm
                       {errors.email ? 'border-red-500/50 bg-red-900/10' : ''}"
                placeholder="Enter your email"
                disabled={loading || success}
                required
              />
              {#if errors.email}
                <p class="mt-1 text-sm text-red-300">{errors.email}</p>
              {/if}
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
                  bind:value={formData.password}
                  class="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl
                         text-white placeholder-gray-300 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent backdrop-blur-sm
                         {errors.password ? 'border-red-500/50 bg-red-900/10' : ''}"
                  placeholder="Create a password"
                  disabled={loading || success}
                  required
                />
                <button
                  type="button"
                  onclick={togglePasswordVisibility}
                  class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  disabled={loading || success}
                >
                  <Icon icon={showPassword ? 'heroicons:eye-slash' : 'heroicons:eye'} class="w-5 h-5" />
                </button>
              </div>
              {#if errors.password}
                <p class="mt-1 text-sm text-red-300">{errors.password}</p>
              {/if}
            </div>

            <!-- Confirm Password -->
            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-blue-100/90 mb-2">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                bind:value={formData.confirmPassword}
                class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl
                       text-white placeholder-gray-300 focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent backdrop-blur-sm
                       {errors.confirmPassword ? 'border-red-500/50 bg-red-900/10' : ''}"
                placeholder="Confirm your password"
                disabled={loading || success}
                required
              />
              {#if errors.confirmPassword}
                <p class="mt-1 text-sm text-red-300">{errors.confirmPassword}</p>
              {/if}
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            disabled={loading || success}
            class="w-full mt-6 px-4 py-3 bg-gradient-to-r from-green-600 to-blue-600
                   hover:from-green-700 hover:to-blue-700 disabled:opacity-50
                   disabled:cursor-not-allowed text-white font-semibold rounded-xl
                   transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
          >
            {#if loading}
              <div class="flex items-center justify-center">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Creating Account...
              </div>
            {:else if success}
              <Icon icon="heroicons:check" class="w-5 h-5 inline mr-2" />
              Account Created!
            {:else}
              <Icon icon="heroicons:user-plus" class="w-5 h-5 inline mr-2" />
              Create Account
            {/if}
          </button>
        </form>
      {/if}

      <!-- Login Link -->
      <div class="mt-6 text-center">
        <p class="text-blue-100/70 text-sm">
          Already have an account?
          <a href="/login" class="text-blue-300 hover:text-blue-200 font-medium transition-colors">
            Sign in here
          </a>
        </p>
      </div>
    </div>
  </div>
</div>