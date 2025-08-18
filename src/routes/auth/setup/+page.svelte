<!--
  Initial Setup Page - Create First Admin Account
  Only accessible when no admin users exist in the system
-->

<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let { data } = $props();

  let isLoading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let showPassword = $state(false);

  // Form data
  let adminData = {
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  };

  // Password strength indicators
  let passwordStrength = $derived(checkPasswordStrength(adminData.password));
  let passwordsMatch = $derived(adminData.password === adminData.confirmPassword);
  let isFormValid = $derived(adminData.username.length >= 3 && 
                   adminData.email.includes('@') && 
                   passwordStrength.score >= 3 && 
                   passwordsMatch);

  onMount(() => {
    // If setup is not needed, redirect to login
    if (!data.needsSetup) {
      goto('/login');
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

  const handleSubmit = async (event) => {
    isLoading = true;
    errorMessage = '';
    successMessage = '';

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
        successMessage = 'Admin account created successfully! You can now log in.';
        setTimeout(() => {
          goto('/login');
        }, 2000);
      } else {
        errorMessage = result.error || 'Setup failed';
      }
    } catch (error) {
      errorMessage = 'Network error. Please try again.';
      console.error('Setup error:', error);
    } finally {
      isLoading = false;
    }
  };
</script>

<svelte:head>
  <title>Initial Setup - G.G. Requestz</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <div class="text-center">
      <h2 class="text-3xl font-bold text-gray-900 mb-2">🎮 G.G. Requestz</h2>
      <p class="text-sm text-gray-600 mb-1">Initial System Setup</p>
      <p class="text-xs text-orange-600">Create the first admin account</p>
    </div>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
      <!-- Info Banner -->
      <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-blue-700">
              This account will have full administrative privileges. You can create additional users later from the admin panel.
            </p>
          </div>
        </div>
      </div>

      <!-- Success Message -->
      {#if successMessage}
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-green-700">{successMessage}</p>
            </div>
          </div>
        </div>
      {/if}

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

      <!-- Setup Form -->
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(e); }} class="space-y-6">
        <!-- Username Field -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700">
            Admin Username *
          </label>
          <div class="mt-1">
            <input
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              required
              bind:value={adminData.username}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="admin"
            />
            {#if adminData.username && adminData.username.length < 3}
              <p class="mt-1 text-xs text-red-600">Username must be at least 3 characters</p>
            {/if}
          </div>
        </div>

        <!-- Email Field -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700">
            Admin Email *
          </label>
          <div class="mt-1">
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              bind:value={adminData.email}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="admin@example.com"
            />
          </div>
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700">
            Password *
          </label>
          <div class="mt-1 relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autocomplete="new-password"
              required
              bind:value={adminData.password}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="Strong password with 8+ characters"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              onclick={() => showPassword = !showPassword}
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
          
          <!-- Password Strength Indicator -->
          {#if adminData.password}
            <div class="mt-2">
              <div class="flex items-center space-x-2">
                <div class="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    class="h-2 rounded-full transition-all duration-300"
                    class:bg-red-500={passwordStrength.score <= 2}
                    class:bg-yellow-500={passwordStrength.score === 3}
                    class:bg-green-500={passwordStrength.score >= 4}
                    style="width: {(passwordStrength.score / 5) * 100}%"
                  ></div>
                </div>
                <span class="text-xs font-medium"
                      class:text-red-600={passwordStrength.score <= 2}
                      class:text-yellow-600={passwordStrength.score === 3}
                      class:text-green-600={passwordStrength.score >= 4}>
                  {passwordStrength.score <= 2 ? 'Weak' : passwordStrength.score === 3 ? 'Good' : 'Strong'}
                </span>
              </div>
              {#if passwordStrength.feedback.length > 0 && passwordStrength.score < 4}
                <p class="mt-1 text-xs text-gray-600">
                  Missing: {passwordStrength.feedback.join(', ')}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Confirm Password Field -->
        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
            Confirm Password *
          </label>
          <div class="mt-1">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              bind:value={adminData.confirmPassword}
              disabled={isLoading}
              class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed sm:text-sm"
              placeholder="Repeat password"
            />
            {#if adminData.confirmPassword && !passwordsMatch}
              <p class="mt-1 text-xs text-red-600">Passwords do not match</p>
            {/if}
          </div>
        </div>

        <!-- Submit Button -->
        <div>
          <button
            type="submit"
            disabled={isLoading || !isFormValid}
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {#if isLoading}
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating admin account...
            {:else}
              Create Admin Account
            {/if}
          </button>
        </div>
      </form>

      <!-- Back to Login Link -->
      <div class="mt-6 text-center">
        <a
          href="/login"
          class="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to login
        </a>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="mt-8 text-center text-xs text-gray-500">
    <p>© 2024 G.G. Requestz. Secure setup with bcrypt encryption.</p>
  </div>
</div>