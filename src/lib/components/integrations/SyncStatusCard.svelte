<script>
  let { 
    provider,
    supportsSync = false,
    userSyncEnabled = false,
    onSyncUsers = () => {},
    onViewStatus = () => {} 
  } = $props();

  let syncing = $state(false);
  let syncResult = $state(null);

  async function handleSyncUsers() {
    try {
      syncing = true;
      syncResult = null;
      
      const result = await onSyncUsers();
      
      if (result.success) {
        syncResult = {
          success: true,
          message: `✅ Sync completed: ${result.stats.synced} users synced, ${result.stats.errors} errors`
        };
      } else {
        syncResult = {
          error: true,
          message: `❌ Sync failed: ${result.error}`
        };
      }
    } catch (error) {
      syncResult = {
        error: true,
        message: `❌ Sync failed: ${error.message}`
      };
    } finally {
      syncing = false;
    }

    // Clear result after 5 seconds
    setTimeout(() => { syncResult = null; }, 5000);
  }
</script>

{#if supportsSync}
  <div class="bg-gray-800 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-white mb-4">User Synchronization</h2>
    <p class="text-gray-300 mb-4">
      Manually sync users from your external system or configure automatic synchronization.
    </p>
    
    <!-- Sync Status -->
    {#if userSyncEnabled}
      <div class="mb-4 p-3 rounded-lg bg-green-900/20 border border-green-500/30">
        <div class="flex items-center">
          <span class="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></span>
          <span class="text-green-400 text-sm">Auto-sync is active for {provider}</span>
        </div>
      </div>
    {:else}
      <div class="mb-4 p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/30">
        <div class="flex items-center">
          <span class="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
          <span class="text-yellow-400 text-sm">Auto-sync is disabled</span>
        </div>
      </div>
    {/if}

    <!-- Sync Result -->
    {#if syncResult}
      <div class="mb-4 p-3 rounded-lg {syncResult.success ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'}">
        <p class="text-white text-sm">{syncResult.message}</p>
      </div>
    {/if}
    
    <!-- Actions -->
    <div class="flex gap-4">
      <button 
        onclick={handleSyncUsers}
        disabled={syncing}
        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition-colors flex items-center"
      >
        {#if syncing}
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
          Syncing...
        {:else}
          🔄 Sync All Users
        {/if}
      </button>
      
      <button 
        onclick={onViewStatus}
        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
      >
        📊 View Sync Status
      </button>
    </div>

    <!-- Help Text -->
    <div class="mt-4 text-sm text-gray-400">
      <p>
        {#if provider === 'api_integration'}
          Manual sync fetches all users from your API endpoint and updates local records.
        {:else if provider === 'webhook_integration'}
          Webhook sync is passive - users are updated when your system sends webhooks.
        {:else}
          User synchronization is not available for this provider.
        {/if}
      </p>
    </div>
  </div>
{/if}