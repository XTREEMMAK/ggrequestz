<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  import CurrentStatusCard from '$lib/components/integrations/CurrentStatusCard.svelte';
  import SyncStatusCard from '$lib/components/integrations/SyncStatusCard.svelte';
  import ProviderCard from '$lib/components/integrations/ProviderCard.svelte';

  let config = $state({
    provider: 'local_auth',
    configuration: {},
    available_providers: {}
  });
  let loading = $state(true);
  let error = $state(null);

  onMount(async () => {
    await loadConfiguration();
  });

  async function loadConfiguration() {
    try {
      loading = true;
      const response = await fetch('/api/integrations/config');
      const result = await response.json();

      if (result.success) {
        config = result;
      } else {
        error = result.error;
      }
    } catch (err) {
      error = 'Failed to load configuration';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  async function handleSaveProvider(providerId, formData) {
    try {
      const response = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, config: formData })
      });

      const result = await response.json();
      
      if (result.success) {
        await loadConfiguration(); // Reload configuration
      }
      
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function handleTestProvider(providerId, formData) {
    try {
      const response = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, config: formData })
      });

      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function handleSyncUsers() {
    try {
      const response = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_all' })
      });

      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function handleViewSyncStatus() {
    window.open('/api/integrations/sync', '_blank');
  }
</script>

<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold text-white mb-8">User Integration Settings</h1>

  {#if loading}
    <div class="bg-gray-800 rounded-lg p-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p class="text-gray-300">Loading configuration...</p>
    </div>
  {:else if error}
    <div class="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
      <h3 class="text-red-400 font-semibold mb-2">Configuration Error</h3>
      <p class="text-red-300">{error}</p>
    </div>
  {:else}
    <!-- Current Status Card -->
    <div class="mb-8">
      <CurrentStatusCard 
        provider={config.provider}
        providerName={config.available_providers[config.provider]?.name}
        description={config.available_providers[config.provider]?.description}
        validation={config.configuration.validation}
        capabilities={config.configuration}
        userSyncEnabled={config.configuration.user_sync_enabled}
      />
    </div>

    <!-- User Sync Controls -->
    <div class="mb-8">
      <SyncStatusCard 
        provider={config.provider}
        supportsSync={config.configuration.supports_sync}
        userSyncEnabled={config.configuration.user_sync_enabled}
        onSyncUsers={handleSyncUsers}
        onViewStatus={handleViewSyncStatus}
      />
    </div>

    <!-- Provider Configuration -->
    <div class="bg-gray-800 rounded-lg p-6 mb-8">
      <h2 class="text-xl font-semibold text-white mb-6">Authentication Providers</h2>

      <div class="space-y-6">
        {#each Object.entries(config.available_providers) as [providerKey, providerInfo]}
          <ProviderCard
            providerId={providerKey}
            definition={providerInfo}
            isActive={config.provider === providerKey}
            config={config.configuration.config || {}}
            onSave={handleSaveProvider}
            onTest={handleTestProvider}
          />
        {/each}
      </div>
    </div>

    <!-- Quick Documentation -->
    <div class="bg-gray-800 rounded-lg p-6">
      <h2 class="text-xl font-semibold text-white mb-4">Quick Reference</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h3 class="text-lg font-medium text-blue-400 mb-3">Environment Variables</h3>
          <div class="space-y-2 text-xs">
            <div class="bg-gray-700 rounded p-2">
              <code class="text-green-400">AUTH_PROVIDER</code> - Current provider
            </div>
            <div class="bg-gray-700 rounded p-2">
              <code class="text-green-400">SESSION_SECRET</code> - JWT signing secret
            </div>
          </div>
        </div>
        
        <div>
          <h3 class="text-lg font-medium text-blue-400 mb-3">API Endpoints</h3>
          <div class="space-y-2 text-xs">
            <div class="bg-gray-700 rounded p-2">
              <code class="text-blue-400">/api/integrations/webhook</code>
            </div>
            <div class="bg-gray-700 rounded p-2">
              <code class="text-blue-400">/api/integrations/sync</code>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-medium text-blue-400 mb-3">Documentation</h3>
          <div class="space-y-2 text-sm">
            <a href="/INTEGRATION_GUIDE.md" target="_blank" class="text-blue-400 hover:text-blue-300 block">
              📖 Full Integration Guide
            </a>
            <a href="/.env.example" target="_blank" class="text-blue-400 hover:text-blue-300 block">
              ⚙️ Environment Template
            </a>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>