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
  
  let loading = $state(false);
  let saveStatus = $state('');
  let activeSection = $state('notifications');

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  
  // Settings sections
  let sections = [
    { 
      id: 'notifications', 
      label: 'Notifications', 
      icon: 'heroicons:bell',
      description: 'Configure notification services'
    },
    { 
      id: 'integrations', 
      label: 'Integrations', 
      icon: 'heroicons:puzzle-piece',
      description: 'External service integrations'
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
    },
    {
      id: 'security',
      label: 'Security Settings',
      icon: 'heroicons:shield-check',
      description: 'Security monitoring and protection'
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

    // Security settings
    'security.404_limit_enabled': settings['security_404_limit'] ? JSON.parse(settings['security_404_limit'] || '{}').enabled : true,
    'security.404_max_attempts': settings['security_404_limit'] ? JSON.parse(settings['security_404_limit'] || '{}').maxAttempts : 5,
    'security.404_time_window': settings['security_404_limit'] ? JSON.parse(settings['security_404_limit'] || '{}').timeWindow : 300,
    'security.404_logout_user': settings['security_404_limit'] ? JSON.parse(settings['security_404_limit'] || '{}').logoutUser : true,
    'security.404_notify_admin': settings['security_404_limit'] ? JSON.parse(settings['security_404_limit'] || '{}').notifyAdmin : true
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
    'security.404_limit_enabled': true,
    'security.404_max_attempts': 5,
    'security.404_time_window': 300,
    'security.404_logout_user': true,
    'security.404_notify_admin': true
  });
  
  // Sync editable data with settings on load
  $effect(() => {
    Object.assign(editableFormData, formData);
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
        // Handle security settings as a JSON object
        if (key.startsWith('security.404_')) {
          continue; // Skip individual security settings, handle them together below
        }

        if (typeof value === 'boolean') {
          settingsToSave[key] = value.toString();
        } else {
          settingsToSave[key] = value;
        }
      }

      // Combine security settings into a single JSON object
      const securitySettings = {
        enabled: editableFormData['security.404_limit_enabled'],
        maxAttempts: parseInt(editableFormData['security.404_max_attempts']) || 5,
        timeWindow: parseInt(editableFormData['security.404_time_window']) || 300,
        logoutUser: editableFormData['security.404_logout_user'],
        notifyAdmin: editableFormData['security.404_notify_admin']
      };

      // Update both the old format and new API format
      settingsToSave['security_404_limit'] = JSON.stringify(securitySettings);

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

        // Update client-side cache for 404 security system
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('ggr_security_settings', JSON.stringify(securitySettings));
        }

        setTimeout(() => { saveStatus = ''; }, 3000);
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      saveStatus = 'error';
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
      if (result.success) {
        toasts.success('Gotify connection successful! Test notification sent.');
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Test Gotify error:', error);
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
      if (result.success) {
        toasts.success('ROMM connection successful! Found ' + (result.total_games || 0) + ' games.');
      } else {
        throw new Error(result.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Test ROMM error:', error);
      toasts.error('ROMM connection failed: ' + error.message);
    } finally {
      loading = false;
    }
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
        Configure system behavior and integrations
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
          <!-- Notifications Section -->
          {#if activeSection === 'notifications'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Notification Settings
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure push notifications for important events like request approvals.
                </p>
              </div>
              
              <!-- Gotify Configuration -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Icon icon="heroicons:bell" class="w-5 h-5 mr-2" />
                  Gotify Push Notifications
                </h3>
                
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
                    Test Connection
                  </button>
                </div>
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
          
          <!-- Integrations Section -->
          {#if activeSection === 'integrations'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  External Integrations
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure connections to external services like ROMM for game library access.
                </p>
              </div>
              
              <!-- ROMM Configuration -->
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 class="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <Icon icon="heroicons:server" class="w-5 h-5 mr-2" />
                  ROMM Game Library
                </h3>
                
                <div class="space-y-4">
                  <div>
                    <label for="romm-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ROMM Server URL
                    </label>
                    <input
                      id="romm-url"
                      type="url"
                      bind:value={editableFormData['romm.server_url']}
                      placeholder="https://romm.yourdomain.com"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      The base URL of your ROMM server instance
                    </p>
                  </div>
                  
                  <div>
                    <label for="romm-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username
                    </label>
                    <input
                      id="romm-username"
                      type="text"
                      bind:value={editableFormData['romm.username']}
                      placeholder="Your ROMM username"
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
                      placeholder="Your ROMM password"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Password for authenticating with your ROMM server
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onclick={testRommConnection}
                    disabled={loading || !editableFormData['romm.server_url'] || !editableFormData['romm.username'] || !editableFormData['romm.password']}
                    class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Test ROMM Connection
                  </button>
                </div>
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

          <!-- Security Settings Section -->
          {#if activeSection === 'security'}
            <div class="space-y-6">
              <div>
                <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  <Icon icon="heroicons:shield-check" class="inline-block w-5 h-5 mr-2" />
                  Security Configuration
                </h2>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Configure security monitoring and protection settings to keep your application safe.
                </p>
              </div>

              <!-- 404 Attack Protection -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
                <div class="flex items-start space-x-3 mb-4">
                  <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                      <Icon icon="heroicons:exclamation-triangle" class="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">404 Attack Protection</h3>
                    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Protect against excessive 404 attempts that could indicate malicious activity or reconnaissance.
                    </p>
                  </div>
                </div>

                <div class="space-y-4">
                  <!-- Enable/Disable -->
                  <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                      <label for="security-404-enabled" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Enable 404 Protection
                      </label>
                      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Monitor and limit excessive 404 attempts from users
                      </p>
                    </div>
                    <div class="ml-4">
                      <label class="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          id="security-404-enabled"
                          bind:checked={editableFormData['security.404_limit_enabled']}
                          disabled={!canEditSettings}
                          class="sr-only peer"
                        />
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                      </label>
                    </div>
                  </div>

                  {#if editableFormData['security.404_limit_enabled']}
                    <!-- Max Attempts -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label for="security-404-max-attempts" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Maximum Attempts
                        </label>
                        <input
                          type="number"
                          id="security-404-max-attempts"
                          bind:value={editableFormData['security.404_max_attempts']}
                          disabled={!canEditSettings}
                          min="1"
                          max="20"
                          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white text-sm"
                          placeholder="5"
                        />
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Number of 404 attempts before taking action (1-20)
                        </p>
                      </div>

                      <div>
                        <label for="security-404-time-window" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Time Window (seconds)
                        </label>
                        <input
                          type="number"
                          id="security-404-time-window"
                          bind:value={editableFormData['security.404_time_window']}
                          disabled={!canEditSettings}
                          min="60"
                          max="3600"
                          step="60"
                          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white text-sm"
                          placeholder="300"
                        />
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Time window for counting attempts (60-3600 seconds)
                        </p>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="space-y-3 pt-2">
                      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Actions to take when limit is exceeded:</h4>

                      <div class="flex items-center justify-between">
                        <div class="flex-1 min-w-0">
                          <label for="security-404-logout" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Logout User
                          </label>
                          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Automatically log out authenticated users who exceed the limit
                          </p>
                        </div>
                        <div class="ml-4">
                          <label class="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              id="security-404-logout"
                              bind:checked={editableFormData['security.404_logout_user']}
                              disabled={!canEditSettings}
                              class="sr-only peer"
                            />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600"></div>
                          </label>
                        </div>
                      </div>

                      <div class="flex items-center justify-between">
                        <div class="flex-1 min-w-0">
                          <label for="security-404-notify" class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Notify Administrators
                          </label>
                          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Send notifications to admins when security violations are detected
                          </p>
                        </div>
                        <div class="ml-4">
                          <label class="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              id="security-404-notify"
                              bind:checked={editableFormData['security.404_notify_admin']}
                              disabled={!canEditSettings}
                              class="sr-only peer"
                            />
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <!-- Security Info -->
                    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                      <div class="flex">
                        <div class="flex-shrink-0">
                          <Icon icon="heroicons:information-circle" class="w-5 h-5 text-blue-400" />
                        </div>
                        <div class="ml-3">
                          <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">Security Note</h4>
                          <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
                            This feature helps protect against automated scanning and potential attackers trying to enumerate your application structure.
                            All security events are logged and can be reviewed in the admin dashboard.
                          </p>
                        </div>
                      </div>
                    </div>
                  {/if}
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