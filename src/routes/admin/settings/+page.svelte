<!--
  Admin system settings interface
-->

<script>
  import { goto } from '$app/navigation';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import { toasts } from '$lib/stores/toast.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let settings = $state(data?.settings || {});
  let userPermissions = $derived(data?.userPermissions || []);
  let globalFilters = $state(data?.globalFilters || {});
  let availableGenres = $state(data?.availableGenres || []);

  let loading = $state(false);
  let saveStatus = $state('');
  let activeSection = $state('integrations');

  // Test result states
  let rommTestResult = $state(null);
  let gotifyTestResult = $state(null);
  let showRommTestDetails = $state(false);
  let showGotifyTestDetails = $state(false);

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  
  // Settings sections
  let sections = [
    {
      id: 'integrations',
      label: 'Tools',
      icon: 'heroicons:wrench-screwdriver',
      description: 'Configure external service connections'
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'heroicons:bell',
      description: 'Configure notification preferences'
    },
    {
      id: 'content',
      label: 'Content Filtering',
      icon: 'heroicons:shield-check',
      description: 'Global content filters (supersede user settings)'
    },
    {
      id: 'requests',
      label: 'Request Settings',
      icon: 'heroicons:clipboard-document-list',
      description: 'Manage request handling behavior'
    },
    {
      id: 'system',
      label: 'System Settings',
      icon: 'heroicons:cog-6-tooth',
      description: 'Core system configuration'
    }
  ];
  
  // Settings form data - derived from settings
  let formData = $derived({
    // Notifications
    'gotify.url': settings['gotify.url'] || '',
    'gotify.token': settings['gotify.token'] || '',
    'gotify.notifications.new_requests': settings['gotify.notifications.new_requests'] === 'true',
    'gotify.notifications.status_changes': settings['gotify.notifications.status_changes'] === 'true',
    'gotify.notifications.admin_actions': settings['gotify.notifications.admin_actions'] === 'true',
    
    // Integrations  
    'romm.server_url': settings['romm.server_url'] || '',
    'romm.username': settings['romm.username'] || '',
    'romm.password': settings['romm.password'] || '',
    
    // Request settings
    'request.auto_approve': settings['request.auto_approve'] === 'true',
    'request.require_approval': settings['request.require_approval'] === 'true',
    
    // System settings
    'system.maintenance_mode': settings['system.maintenance_mode'] === 'true',
    'system.registration_enabled': settings['system.registration_enabled'] === 'true',

    // Global content filters
    'content.global_filter_enabled': globalFilters.enabled || false,
    'content.global_max_esrb_rating': globalFilters.max_esrb_rating || 'M',
    'content.global_hide_mature': globalFilters.hide_mature_content || false,
    'content.global_hide_nsfw': globalFilters.hide_nsfw_content || false,
    'content.global_custom_blocks': Array.isArray(globalFilters.custom_content_blocks) ? globalFilters.custom_content_blocks : [],
    'content.global_excluded_genres': Array.isArray(globalFilters.excluded_genres) ? globalFilters.excluded_genres : [],
    'content.global_banned_games': Array.isArray(globalFilters.banned_games) ? globalFilters.banned_games : [],
  });
  
  // Editable form state
  let editableFormData = $state({
    'gotify.url': '',
    'gotify.token': '',
    'gotify.notifications.new_requests': true,
    'gotify.notifications.status_changes': true,
    'gotify.notifications.admin_actions': false,
    'romm.server_url': '',
    'romm.username': '',
    'romm.password': '',
    'request.auto_approve': false,
    'request.require_approval': false,
    'system.maintenance_mode': false,
    'system.registration_enabled': false,
    'content.global_filter_enabled': false,
    'content.global_max_esrb_rating': 'M',
    'content.global_hide_mature': false,
    'content.global_hide_nsfw': false,
    'content.global_custom_blocks': [],
    'content.global_excluded_genres': [],
    'content.global_banned_games': [],
  });
  
  // Sync editable data with settings on load only if form is empty
  let hasInitialized = $state(false);
  $effect(() => {
    if (!hasInitialized) {
      Object.assign(editableFormData, formData);
      hasInitialized = true;
    }
  });
  
  // Permission check
  let canEditSettings = $derived(userPermissions.includes('system.settings'));
  
  async function saveSettings() {
    if (!canEditSettings) return;
    
    loading = true;
    saveStatus = '';
    
    try {
      // Convert form data to API format
      const settingsToSave = {};
      for (const [key, value] of Object.entries(editableFormData)) {
        if (typeof value === 'boolean') {
          settingsToSave[key] = value.toString();
        } else {
          settingsToSave[key] = value;
        }
      }

      const response = await fetch('/admin/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToSave })
      });

      const result = await response.json();
      if (result.success) {
        saveStatus = 'success';
        // Update local settings
        settings = { ...settings, ...settingsToSave };

        toasts.success('Settings saved successfully');
        setTimeout(() => { saveStatus = ''; }, 3000);
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      saveStatus = 'error';
      toasts.error(error.message || 'Failed to save settings');
      setTimeout(() => { saveStatus = ''; }, 5000);
    } finally {
      loading = false;
    }
  }
  
  async function testGotifyConnection() {
    if (!editableFormData['gotify.url'] || !editableFormData['gotify.token']) {
      toasts.error('Please enter both Gotify URL and token');
      return;
    }

    loading = true;
    gotifyTestResult = null;
    const startTime = Date.now();

    try {
      const response = await fetch('/admin/api/settings/test-gotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: editableFormData['gotify.url'],
          token: editableFormData['gotify.token']
        })
      });

      const result = await response.json();
      const responseTime = Date.now() - startTime;

      if (result.success) {
        gotifyTestResult = {
          success: true,
          response_time: responseTime,
          timestamp: new Date().toLocaleString()
        };
        toasts.success('Gotify connection successful! Test notification sent.');
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Test Gotify error:', error);
      gotifyTestResult = {
        success: false,
        error: error.message,
        response_time: Date.now() - startTime,
        timestamp: new Date().toLocaleString()
      };
      toasts.error('Gotify connection failed: ' + error.message);
    } finally {
      loading = false;
    }
  }
  
  async function testRommConnection() {
    if (!editableFormData['romm.server_url'] || !editableFormData['romm.username'] || !editableFormData['romm.password']) {
      toasts.error('Please enter ROMM server URL, username, and password');
      return;
    }

    loading = true;
    rommTestResult = null;
    const startTime = Date.now();

    try {
      const response = await fetch('/admin/api/settings/test-romm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_url: editableFormData['romm.server_url'],
          username: editableFormData['romm.username'],
          password: editableFormData['romm.password']
        })
      });

      const result = await response.json();
      const responseTime = Date.now() - startTime;

      if (result.success) {
        rommTestResult = {
          success: true,
          server_info: result.server_info,
          total_games: result.total_games,
          response_time: responseTime,
          timestamp: new Date().toLocaleString()
        };
        toasts.success(`ROMM connection successful! Found ${result.total_games || 0} games.`);
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Test ROMM error:', error);
      rommTestResult = {
        success: false,
        error: error.message,
        response_time: Date.now() - startTime,
        timestamp: new Date().toLocaleString()
      };
      toasts.error('ROMM connection failed: ' + error.message);
    } finally {
      loading = false;
    }
  }

  // Global content filter helpers
  async function saveGlobalFilters() {
    if (!canEditSettings) return;

    loading = true;
    saveStatus = '';

    try {
      const globalFilterData = {
        enabled: editableFormData['content.global_filter_enabled'],
        max_esrb_rating: editableFormData['content.global_max_esrb_rating'],
        hide_mature_content: editableFormData['content.global_hide_mature'],
        hide_nsfw_content: editableFormData['content.global_hide_nsfw'],
        custom_content_blocks: editableFormData['content.global_custom_blocks'],
        excluded_genres: editableFormData['content.global_excluded_genres'],
        banned_games: editableFormData['content.global_banned_games'],
      };

      const response = await fetch('/admin/api/settings/content-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalFilterData)
      });

      const result = await response.json();
      if (result.success) {
        saveStatus = 'success';
        globalFilters = globalFilterData;
        toasts.success('Global content filters saved successfully');
        setTimeout(() => { saveStatus = ''; }, 3000);
      } else {
        throw new Error(result.error || 'Failed to save global filters');
      }
    } catch (error) {
      console.error('Save global filters error:', error);
      saveStatus = 'error';
      toasts.error(error.message || 'Failed to save global filters');
      setTimeout(() => { saveStatus = ''; }, 5000);
    } finally {
      loading = false;
    }
  }

  function toggleGlobalExcludedGenre(genreName) {
    const excluded = editableFormData['content.global_excluded_genres'] || [];
    if (excluded.includes(genreName)) {
      editableFormData['content.global_excluded_genres'] = excluded.filter(g => g !== genreName);
    } else {
      editableFormData['content.global_excluded_genres'] = [...excluded, genreName];
    }
  }

  function addGlobalCustomBlock(keyword) {
    const blocks = editableFormData['content.global_custom_blocks'] || [];
    const trimmed = keyword.trim().toLowerCase();
    if (trimmed && !blocks.includes(trimmed)) {
      editableFormData['content.global_custom_blocks'] = [...blocks, trimmed];
    }
  }

  function removeGlobalCustomBlock(keyword) {
    const blocks = editableFormData['content.global_custom_blocks'] || [];
    editableFormData['content.global_custom_blocks'] = blocks.filter(b => b !== keyword);
  }

  function addGlobalBannedGame(igdbId) {
    const bannedGames = editableFormData['content.global_banned_games'] || [];
    const trimmed = igdbId.trim();
    const gameId = parseInt(trimmed);

    if (!isNaN(gameId) && gameId > 0 && !bannedGames.includes(gameId)) {
      editableFormData['content.global_banned_games'] = [...bannedGames, gameId];
    }
  }

  function removeGlobalBannedGame(igdbId) {
    const bannedGames = editableFormData['content.global_banned_games'] || [];
    editableFormData['content.global_banned_games'] = bannedGames.filter(id => id !== igdbId);
  }

  // Confirmation dialog helpers
  function showConfirmation(title, message, action) {
    confirmTitle = title;
    confirmMessage = message;
    confirmAction = action;
    showConfirmDialog = true;
  }

  function handleConfirmYes() {
    showConfirmDialog = false;
    if (confirmAction) {
      confirmAction();
    }
  }

  function handleConfirmNo() {
    showConfirmDialog = false;
    confirmAction = null;
  }
</script>

<svelte:head>
  <title>System Settings - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        System Settings
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Configure system behavior and external services
      </p>
    </div>
    
    {#if canEditSettings}
      <div class="flex items-center space-x-3">
        {#if saveStatus === 'success'}
          <span class="text-green-600 dark:text-green-400 text-sm font-medium">
            ✅ Settings saved successfully
          </span>
        {:else if saveStatus === 'error'}
          <span class="text-red-600 dark:text-red-400 text-sm font-medium">
            ❌ Failed to save settings
          </span>
        {/if}
        
        <button
          type="button"
          onclick={saveSettings}
          disabled={loading}
          class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          {#if loading}
            <LoadingSpinner size="sm" color="white" />
            <span>Saving...</span>
          {:else}
            <span>Save Settings</span>
          {/if}
        </button>
      </div>
    {/if}
  </div>
  
  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <!-- Sidebar navigation -->
    <div class="lg:col-span-1">
      <nav class="space-y-1">
        {#each sections as section}
          <button
            type="button"
            onclick={() => activeSection = section.id}
            class="w-full flex items-start space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left"
            class:bg-blue-100={activeSection === section.id}
            class:text-blue-700={activeSection === section.id}
            class:dark:bg-blue-900={activeSection === section.id}
            class:dark:text-blue-200={activeSection === section.id}
            class:text-gray-700={activeSection !== section.id}
            class:hover:bg-gray-100={activeSection !== section.id}
            class:dark:text-gray-300={activeSection !== section.id}
            class:dark:hover:bg-gray-700={activeSection !== section.id}
          >
            <Icon icon={section.icon} class="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <div class="font-medium">{section.label}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {section.description}
              </div>
            </div>
          </button>
        {/each}
      </nav>
    </div>
    
    <!-- Settings content -->
    <div class="lg:col-span-3">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        {#if !canEditSettings}
          <div class="text-center py-8">
            <Icon icon="heroicons:lock-closed" class="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Access Denied
            </h3>
            <p class="text-gray-500 dark:text-gray-400">
              You don't have permission to modify system settings.
            </p>
          </div>
        {:else}
          <!-- Tools Section -->
          {#if activeSection === 'integrations'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  External Service Tools
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure connections to external services like ROMM library and notification providers.
                </p>
              </div>

              <!-- Testing Configuration Warning -->
              <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
                <div class="flex items-start">
                  <Icon icon="heroicons:information-circle" class="w-5 h-5 text-yellow-600 dark:text-yellow-500 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-1">Testing Configuration</h4>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300">
                      These sections are used for testing only. Please add to your environment file.
                    </p>
                  </div>
                </div>
              </div>

              <!-- ROMM Integration -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Icon icon="heroicons:server" class="w-5 h-5 mr-2" />
                  ROMM Library Integration
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Connect to your ROMM instance to display game availability and library status.
                </p>

                <div class="space-y-4">
                  <div>
                    <label for="romm-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ROMM Server URL
                    </label>
                    <input
                      id="romm-url"
                      type="url"
                      bind:value={editableFormData['romm.server_url']}
                      placeholder="http://your-romm-server:8080"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The base URL of your ROMM server (include http:// or https://)
                    </p>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label for="romm-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Username
                      </label>
                      <input
                        id="romm-username"
                        type="text"
                        bind:value={editableFormData['romm.username']}
                        placeholder="ROMM username"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label for="romm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Password
                      </label>
                      <input
                        id="romm-password"
                        type="password"
                        bind:value={editableFormData['romm.password']}
                        placeholder="ROMM password"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div class="flex items-center space-x-3">
                    <button
                      type="button"
                      onclick={testRommConnection}
                      disabled={loading || !editableFormData['romm.server_url'] || !editableFormData['romm.username'] || !editableFormData['romm.password']}
                      class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Test ROMM Connection
                    </button>

                    <a
                      href="https://github.com/XTREEMMAK/ggrequestz/blob/main/docs/guides/INTEGRATION_GUIDE.md#romm-library-integration"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm flex items-center space-x-1"
                    >
                      <Icon icon="heroicons:question-mark-circle" class="w-4 h-4" />
                      <span>Setup Guide</span>
                      <Icon icon="heroicons:arrow-top-right-on-square" class="w-3 h-3" />
                    </a>
                  </div>

                  <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p><strong>Requirements:</strong> ROMM user must have "Editor" or "Admin" role for API access.</p>
                    <p><strong>Troubleshooting:</strong> Check network connectivity, credentials, and ROMM server status.</p>
                  </div>

                  <!-- ROMM Test Results -->
                  {#if rommTestResult}
                    <div class="mt-4 p-3 rounded-lg border {rommTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                          {#if rommTestResult.success}
                            <Icon icon="heroicons:check-circle" class="w-5 h-5 text-green-600 dark:text-green-400" />
                            <span class="text-sm font-medium text-green-800 dark:text-green-200">
                              Connection Successful
                            </span>
                          {:else}
                            <Icon icon="heroicons:x-circle" class="w-5 h-5 text-red-600 dark:text-red-400" />
                            <span class="text-sm font-medium text-red-800 dark:text-red-200">
                              Connection Failed
                            </span>
                          {/if}
                        </div>
                        <button
                          type="button"
                          onclick={() => showRommTestDetails = !showRommTestDetails}
                          class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center space-x-1"
                        >
                          <span>{showRommTestDetails ? 'Hide' : 'Show'} Details</span>
                          <Icon icon="heroicons:chevron-{showRommTestDetails ? 'up' : 'down'}" class="w-3 h-3" />
                        </button>
                      </div>

                      {#if rommTestResult.success}
                        <div class="mt-2 text-sm text-green-700 dark:text-green-300">
                          <p>🎮 Found {rommTestResult.total_games} games in library</p>
                          <p>🖥️ Server: {rommTestResult.server_info?.url}</p>
                        </div>
                      {:else}
                        <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                          <p class="font-medium">Error:</p>
                          <p class="font-mono text-xs bg-red-100 dark:bg-red-900/30 p-2 rounded mt-1">{rommTestResult.error}</p>
                        </div>
                      {/if}

                      {#if showRommTestDetails}
                        <div class="mt-3 pt-3 border-t {rommTestResult.success ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}">
                          <div class="grid grid-cols-2 gap-4 text-xs {rommTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            <div>
                              <span class="font-medium">Response Time:</span>
                              <span class="ml-1">{rommTestResult.response_time}ms</span>
                            </div>
                            <div>
                              <span class="font-medium">Tested:</span>
                              <span class="ml-1">{rommTestResult.timestamp}</span>
                            </div>
                          </div>

                          {#if !rommTestResult.success}
                            <div class="mt-3">
                              <p class="text-xs font-medium {rommTestResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'} mb-2">
                                Common Solutions:
                              </p>
                              <ul class="text-xs {rommTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} space-y-1 list-disc list-inside">
                                <li>Verify ROMM server is running and accessible</li>
                                <li>Check URL format includes http:// or https://</li>
                                <li>Ensure user has "Editor" or "Admin" role in ROMM</li>
                                <li>Test credentials by logging into ROMM web interface</li>
                                <li>Check network connectivity between servers</li>
                              </ul>
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Gotify Configuration -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Icon icon="heroicons:bell" class="w-5 h-5 mr-2" />
                  Gotify Push Notifications
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure Gotify server for push notifications about new requests and status changes.
                </p>

                <div class="space-y-4">
                  <div>
                    <label for="gotify-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gotify Server URL
                    </label>
                    <input
                      id="gotify-url"
                      type="url"
                      bind:value={editableFormData['gotify.url']}
                      placeholder="https://gotify.yourdomain.com"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The base URL of your Gotify server (without /message)
                    </p>
                  </div>

                  <div>
                    <label for="gotify-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Application Token
                    </label>
                    <input
                      id="gotify-token"
                      type="password"
                      bind:value={editableFormData['gotify.token']}
                      placeholder="App token from Gotify"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Create an application in Gotify and paste the token here
                    </p>
                  </div>

                  <button
                    type="button"
                    onclick={testGotifyConnection}
                    disabled={loading || !editableFormData['gotify.url'] || !editableFormData['gotify.token']}
                    class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Test Gotify Connection
                  </button>

                  <!-- Gotify Test Results -->
                  {#if gotifyTestResult}
                    <div class="mt-4 p-3 rounded-lg border {gotifyTestResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                          {#if gotifyTestResult.success}
                            <Icon icon="heroicons:check-circle" class="w-5 h-5 text-green-600 dark:text-green-400" />
                            <span class="text-sm font-medium text-green-800 dark:text-green-200">
                              Connection Successful
                            </span>
                          {:else}
                            <Icon icon="heroicons:x-circle" class="w-5 h-5 text-red-600 dark:text-red-400" />
                            <span class="text-sm font-medium text-red-800 dark:text-red-200">
                              Connection Failed
                            </span>
                          {/if}
                        </div>
                        <button
                          type="button"
                          onclick={() => showGotifyTestDetails = !showGotifyTestDetails}
                          class="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center space-x-1"
                        >
                          <span>{showGotifyTestDetails ? 'Hide' : 'Show'} Details</span>
                          <Icon icon="heroicons:chevron-{showGotifyTestDetails ? 'up' : 'down'}" class="w-3 h-3" />
                        </button>
                      </div>

                      {#if gotifyTestResult.success}
                        <div class="mt-2 text-sm text-green-700 dark:text-green-300">
                          <p>✅ Test notification sent successfully</p>
                          <p>📱 Check your Gotify client for the test message</p>
                        </div>
                      {:else}
                        <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                          <p class="font-medium">Error:</p>
                          <p class="font-mono text-xs bg-red-100 dark:bg-red-900/30 p-2 rounded mt-1">{gotifyTestResult.error}</p>
                        </div>
                      {/if}

                      {#if showGotifyTestDetails}
                        <div class="mt-3 pt-3 border-t {gotifyTestResult.success ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}">
                          <div class="grid grid-cols-2 gap-4 text-xs {gotifyTestResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                            <div>
                              <span class="font-medium">Response Time:</span>
                              <span class="ml-1">{gotifyTestResult.response_time}ms</span>
                            </div>
                            <div>
                              <span class="font-medium">Tested:</span>
                              <span class="ml-1">{gotifyTestResult.timestamp}</span>
                            </div>
                          </div>

                          {#if !gotifyTestResult.success}
                            <div class="mt-3">
                              <p class="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
                                Common Solutions:
                              </p>
                              <ul class="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                                <li>Verify Gotify server is running and accessible</li>
                                <li>Check URL format (should not include /message)</li>
                                <li>Ensure application token is valid and not expired</li>
                                <li>Test by accessing Gotify web interface directly</li>
                                <li>Check network connectivity and firewall settings</li>
                              </ul>
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          <!-- Notifications Section -->
          {#if activeSection === 'notifications'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Notification Preferences
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure which events should trigger notifications. Set up notification providers in the Tools section.
                </p>
              </div>

              <!-- Notification Types Configuration -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Icon icon="heroicons:cog-6-tooth" class="w-5 h-5 mr-2" />
                  Notification Types
                </h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Choose which events should trigger Gotify notifications.
                </p>
                
                <div class="space-y-3">
                  <label class="flex items-center">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['gotify.notifications.new_requests']}
                      class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <div class="ml-3">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        🎮 New Game Requests
                      </span>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        Notify when users submit new game requests
                      </p>
                    </div>
                  </label>
                  
                  <label class="flex items-center">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['gotify.notifications.status_changes']}
                      class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <div class="ml-3">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        🔔 Status Changes
                      </span>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        Notify when request status changes (approved, rejected, etc.)
                      </p>
                    </div>
                  </label>
                  
                  <label class="flex items-center">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['gotify.notifications.admin_actions']}
                      class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <div class="ml-3">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">
                        ⚙️ Admin Actions
                      </span>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        Notify about admin-level events (user management, system changes)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          {/if}

          <!-- Content Filtering Section -->
          {#if activeSection === 'content'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Global Content Filters
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Set system-wide content filtering rules that supersede individual user preferences.
                </p>
                <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
                  <div class="flex items-start">
                    <Icon icon="heroicons:exclamation-triangle" class="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2 flex-shrink-0" />
                    <div class="text-sm text-amber-800 dark:text-amber-200">
                      <p class="font-medium mb-1">Important:</p>
                      <ul class="list-disc list-inside space-y-1 text-xs">
                        <li>Global filters apply to all users and cannot be bypassed</li>
                        <li>Users can add their own restrictions on top of these</li>
                        <li>Changes invalidate cached content for all users</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Enable/Disable Global Filtering -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={editableFormData['content.global_filter_enabled']}
                    class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    disabled={!canEditSettings}
                  />
                  <div class="ml-3">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">
                      Enable Global Content Filtering
                    </span>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      Turn on system-wide content restrictions
                    </p>
                  </div>
                </label>
              </div>

              <!-- Filter Options (only shown when enabled) -->
              {#if editableFormData['content.global_filter_enabled']}
                <!-- ESRB Rating Limit -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <Icon icon="heroicons:star" class="w-5 h-5 mr-2" />
                    Maximum ESRB Rating
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Set the highest ESRB rating allowed on the platform
                  </p>
                  <select
                    bind:value={editableFormData['content.global_max_esrb_rating']}
                    class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    disabled={!canEditSettings}
                  >
                    <option value="EC">EC (Early Childhood)</option>
                    <option value="E">E (Everyone)</option>
                    <option value="E10+">E10+ (Everyone 10+)</option>
                    <option value="T">T (Teen)</option>
                    <option value="M">M (Mature 17+)</option>
                    <option value="AO">AO (Adults Only 18+)</option>
                  </select>
                </div>

                <!-- Mature Content Toggles -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <Icon icon="heroicons:shield-exclamation" class="w-5 h-5 mr-2" />
                    Content Restrictions
                  </h3>
                  <div class="space-y-3">
                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        bind:checked={editableFormData['content.global_hide_mature']}
                        class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!canEditSettings}
                      />
                      <div class="ml-3">
                        <span class="text-sm font-medium text-gray-900 dark:text-white">
                          Hide Mature Content
                        </span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          Block games with mature themes and content descriptors
                        </p>
                      </div>
                    </label>

                    <label class="flex items-center">
                      <input
                        type="checkbox"
                        bind:checked={editableFormData['content.global_hide_nsfw']}
                        class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        disabled={!canEditSettings}
                      />
                      <div class="ml-3">
                        <span class="text-sm font-medium text-gray-900 dark:text-white">
                          Hide NSFW Content
                        </span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          Block games with sexual content or nudity
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <!-- Custom Content Blocks -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <Icon icon="heroicons:no-symbol" class="w-5 h-5 mr-2" />
                    Custom Content Blocks
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Block games containing specific keywords in titles or descriptions
                  </p>

                  <div class="flex flex-wrap gap-2 mb-3">
                    {#each (editableFormData['content.global_custom_blocks'] || []) as keyword}
                      <span class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                        {keyword}
                        <button
                          type="button"
                          onclick={() => removeGlobalCustomBlock(keyword)}
                          class="ml-2 hover:text-red-600 dark:hover:text-red-400"
                          disabled={!canEditSettings}
                        >
                          ×
                        </button>
                      </span>
                    {/each}
                  </div>

                  <div class="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter keyword to block"
                      class="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={!canEditSettings}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          e.preventDefault();
                          addGlobalCustomBlock(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>

                <!-- Excluded Genres -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <Icon icon="heroicons:tag" class="w-5 h-5 mr-2" />
                    Excluded Genres
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Hide games from specific genres across the platform
                  </p>

                  <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {#each availableGenres as genre}
                      <label class="flex items-center p-2 rounded border {(editableFormData['content.global_excluded_genres'] || []).includes(genre.name) ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}">
                        <input
                          type="checkbox"
                          checked={(editableFormData['content.global_excluded_genres'] || []).includes(genre.name)}
                          onchange={() => toggleGlobalExcludedGenre(genre.name)}
                          class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          disabled={!canEditSettings}
                        />
                        <span class="ml-2 text-sm text-gray-900 dark:text-white">{genre.name}</span>
                      </label>
                    {/each}
                  </div>
                </div>

                <!-- Banned Games -->
                <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                    <Icon icon="heroicons:x-circle" class="w-5 h-5 mr-2" />
                    Banned Games
                  </h3>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Ban specific games by their IGDB ID. Banned games will not appear in search results, popular games, or anywhere on the platform.
                  </p>

                  <div class="flex flex-wrap gap-2 mb-3">
                    {#each (editableFormData['content.global_banned_games'] || []) as gameId}
                      <span class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                        ID: {gameId}
                        <button
                          type="button"
                          onclick={() => removeGlobalBannedGame(gameId)}
                          class="ml-2 hover:text-red-600 dark:hover:text-red-400"
                          disabled={!canEditSettings}
                        >
                          ×
                        </button>
                      </span>
                    {/each}
                  </div>

                  <div class="flex gap-2">
                    <input
                      type="number"
                      placeholder="Enter IGDB game ID"
                      class="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={!canEditSettings}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          e.preventDefault();
                          addGlobalBannedGame(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    You can find the IGDB ID in the game's URL on IGDB.com or by searching for the game in the app.
                  </p>
                </div>
              {/if}

              <!-- Save Button -->
              <div class="flex justify-end">
                <button
                  type="button"
                  onclick={saveGlobalFilters}
                  disabled={!canEditSettings || loading}
                  class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {#if loading}
                    <LoadingSpinner size="sm" class="mr-2" />
                  {:else}
                    <Icon icon="heroicons:check" class="w-5 h-5 mr-2" />
                  {/if}
                  Save Global Filters
                </button>
              </div>
            </div>
          {/if}


          <!-- Request Settings Section -->
          {#if activeSection === 'requests'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Request Handling
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure how game requests are processed and managed.
                </p>
              </div>
              
              <div class="space-y-4">
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                      Auto-approve Requests
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Automatically approve all new game requests without manual review
                    </p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['request.auto_approve']}
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                      Require Admin Approval
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      All requests must be manually approved by an administrator
                    </p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['request.require_approval']}
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          {/if}
          
          <!-- System Settings Section -->
          {#if activeSection === 'system'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  System Configuration
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Core system settings that affect overall application behavior.
                </p>
              </div>
              
              <div class="space-y-4">
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                      Maintenance Mode
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Temporarily disable the site for maintenance (admins can still access)
                    </p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['system.maintenance_mode']}
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                      User Registration
                    </h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Allow new users to register and create accounts
                    </p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={editableFormData['system.registration_enabled']}
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          {/if}

        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Confirmation Modal -->
{#if showConfirmDialog}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">
            {confirmTitle}
          </h3>
          <button
            type="button"
            onclick={handleConfirmNo}
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <p class="text-gray-600 dark:text-gray-400 mb-6">
          {confirmMessage}
        </p>

        <div class="flex items-center justify-end space-x-3">
          <button
            type="button"
            onclick={handleConfirmNo}
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={handleConfirmYes}
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}