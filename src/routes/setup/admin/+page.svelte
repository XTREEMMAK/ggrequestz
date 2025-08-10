<!--
  Setup Admin Creation Page - Enhanced admin account setup
-->

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '@iconify/svelte';

  let { data } = $props();
  let backgroundImage = $state('');
  let imageLoaded = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state('');
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  // Form data
  let adminData = $state({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  // Password strength indicators
  let passwordStrength = $derived(checkPasswordStrength(adminData.password));
  let passwordsMatch = $derived(adminData.password === adminData.confirmPassword);
  let isFormValid = $derived(
    adminData.username.length >= 3 && 
    adminData.email.includes('@') && 
    passwordStrength.score >= 3 && 
    passwordsMatch
  );

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
  });

  function checkPasswordStrength(password) {
    let score = 0;
    let feedback = [];

    if (password.length >= 8) score++;
    else feedback.push('At least 8 characters');

    if (/[a-z]/.test(password)) score++;
    else feedback.push('Lowercase letter');

    if (/[A-Z]/.test(password)) score++;
    else feedback.push('Uppercase letter');

    if (/[0-9]/.test(password)) score++;
    else feedback.push('Number');

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else feedback.push('Special character');

    return { score, feedback };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isFormValid) return;
    
    isLoading = true;
    errorMessage = '';

    try {
      const formData = new FormData();
      formData.append('username', adminData.username);
      formData.append('email', adminData.email);
      formData.append('password', adminData.password);

      const response = await fetch('/api/auth/basic/setup', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        goto('/setup/complete');
      } else {
        errorMessage = result.error || 'Setup failed';
      }
    } catch (error) {
      errorMessage = 'Network error. Please try again.';
      console.error('Setup error:', error);
    } finally {
      isLoading = false;
    }
  }

  function goBack() {
    goto('/setup/checks');
  }
</script>

<svelte:head>
  <title>Create Admin Account - GameRequest Setup</title>
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
  <div class="w-full max-w-2xl">
    <!-- Background effects -->
    <div class="absolute inset-0 bg-gradient-to-r from-pink-500/20 via-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl transform -rotate-1 animate-pulse"></div>
    
    <!-- Main card -->
    <div class="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-20 h-20 mb-4 flex items-center justify-center">
          <img src="/GGR_Logo.webp" alt="GameRequest Logo" class="w-full h-full object-contain" />
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">Create Admin Account</h1>
        <p class="text-blue-100/80">Set up your first administrator account</p>
      </div>

      <!-- Info Banner -->
      <div class="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <div class="flex items-start space-x-3">
          <Icon icon="heroicons:information-circle" class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-blue-100 text-sm font-medium mb-1">Administrator Privileges</p>
            <p class="text-blue-200/80 text-sm">
              This account will have full administrative privileges including user management, 
              system configuration, and request oversight. Additional users can be created later from the admin panel.
            </p>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      {#if errorMessage}
        <div class="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div class="flex items-center space-x-3">
            <Icon icon="heroicons:x-circle" class="w-5 h-5 text-red-400" />
            <p class="text-red-100 text-sm">{errorMessage}</p>
          </div>
        </div>
      {/if}

      <!-- Form -->
      <form onsubmit={handleSubmit} class="space-y-6 mb-8">
        <!-- Username Field -->
        <div>
          <label for="username" class="block text-sm font-medium text-white mb-2">
            Admin Username *
          </label>
          <input
            id="username"
            type="text"
            bind:value={adminData.username}
            disabled={isLoading}
            class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-300 
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter admin username"
            required
          />
          {#if adminData.username && adminData.username.length < 3}
            <p class="mt-1 text-xs text-red-300">Username must be at least 3 characters</p>
          {/if}
        </div>

        <!-- Email Field -->
        <div>
          <label for="email" class="block text-sm font-medium text-white mb-2">
            Admin Email *
          </label>
          <input
            id="email"
            type="email"
            bind:value={adminData.email}
            disabled={isLoading}
            class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-300 
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="admin@example.com"
            required
          />
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="block text-sm font-medium text-white mb-2">
            Password *
          </label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              bind:value={adminData.password}
              disabled={isLoading}
              class="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-300 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Strong password with 8+ characters"
              required
            />
            <button
              type="button"
              onclick={() => showPassword = !showPassword}
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-white"
            >
              <Icon icon={showPassword ? 'heroicons:eye-slash' : 'heroicons:eye'} class="w-5 h-5" />
            </button>
          </div>
          
          <!-- Password Strength Indicator -->
          {#if adminData.password}
            <div class="mt-3">
              <div class="flex items-center space-x-2 mb-2">
                <div class="flex-1 bg-white/20 rounded-full h-2">
                  <div 
                    class="h-2 rounded-full transition-all duration-300 {passwordStrength.score <= 2 ? 'bg-red-500' : passwordStrength.score === 3 ? 'bg-yellow-500' : 'bg-green-500'}"
                    style="width: {(passwordStrength.score / 5) * 100}%"
                  ></div>
                </div>
                <span class="text-xs font-medium {passwordStrength.score <= 2 ? 'text-red-300' : passwordStrength.score === 3 ? 'text-yellow-300' : 'text-green-300'}">
                  {passwordStrength.score <= 2 ? 'Weak' : passwordStrength.score === 3 ? 'Good' : 'Strong'}
                </span>
              </div>
              {#if passwordStrength.feedback.length > 0 && passwordStrength.score < 4}
                <p class="text-xs text-gray-300">
                  Missing: {passwordStrength.feedback.join(', ')}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Confirm Password Field -->
        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-white mb-2">
            Confirm Password *
          </label>
          <div class="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              bind:value={adminData.confirmPassword}
              disabled={isLoading}
              class="w-full px-4 py-3 pr-12 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-300 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Repeat password"
              required
            />
            <button
              type="button"
              onclick={() => showConfirmPassword = !showConfirmPassword}
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-white"
            >
              <Icon icon={showConfirmPassword ? 'heroicons:eye-slash' : 'heroicons:eye'} class="w-5 h-5" />
            </button>
          </div>
          {#if adminData.confirmPassword && !passwordsMatch}
            <p class="mt-1 text-xs text-red-300">Passwords do not match</p>
          {/if}
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          class="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 
                 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200
                 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]
                 shadow-xl"
        >
          {#if isLoading}
            <Icon icon="heroicons:arrow-path" class="w-5 h-5 inline mr-2 animate-spin" />
            Creating Admin Account...
          {:else}
            <Icon icon="heroicons:user-plus" class="w-5 h-5 inline mr-2" />
            Create Admin Account
          {/if}
        </button>
      </form>

      <!-- Navigation -->
      <div class="flex items-center justify-between">
        <button
          type="button"
          onclick={goBack}
          disabled={isLoading}
          class="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
        >
          <Icon icon="heroicons:arrow-left" class="w-4 h-4 inline mr-2" />
          Back
        </button>

        <div class="text-center">
          <!-- Progress indicator -->
          <div class="flex items-center justify-center space-x-2 mb-2">
            <div class="w-3 h-3 bg-green-400 rounded-full"></div>
            <div class="w-3 h-3 bg-green-400 rounded-full"></div>
            <div class="w-3 h-3 bg-blue-400 rounded-full"></div>
            <div class="w-3 h-3 bg-gray-400/30 rounded-full"></div>
          </div>
          <p class="text-xs text-blue-200/60">Step 3 of 4: Admin Account</p>
        </div>
      </div>
    </div>
  </div>
</div>