<script>
  let { 
    provider,
    providerName = '',
    description = '',
    validation = {},
    capabilities = {},
    userSyncEnabled = false 
  } = $props();

  function getProviderIcon(providerId) {
    const icons = {
      authentik: '🔐',
      oidc_generic: '🌐',
      api_integration: '🔄',
      webhook_integration: '📡',
      local_auth: '👤'
    };
    return icons[providerId] || '⚙️';
  }

  function getStatusColor(isValid) {
    return isValid ? 'text-green-400 bg-green-900/50' : 'text-red-400 bg-red-900/50';
  }
</script>

<div class="bg-gray-800 rounded-lg p-6">
  <h2 class="text-xl font-semibold text-white mb-4">Current Configuration</h2>
  
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Provider Info -->
    <div>
      <label class="text-sm text-gray-400 mb-2 block">Authentication Provider</label>
      <div class="flex items-center">
        <span class="text-2xl mr-3">{getProviderIcon(provider)}</span>
        <div>
          <p class="text-white font-medium">{providerName}</p>
          <p class="text-sm text-gray-400">{description}</p>
        </div>
      </div>
    </div>
    
    <!-- Configuration Status -->
    <div>
      <label class="text-sm text-gray-400 mb-2 block">Configuration Status</label>
      <div>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs {getStatusColor(validation.valid)}">
          {validation.valid ? '✅ Valid Configuration' : '❌ Invalid Configuration'}
        </span>
        {#if !validation.valid && validation.message}
          <p class="text-xs text-red-400 mt-1">{validation.message}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Capabilities -->
  <div class="mt-6">
    <label class="text-sm text-gray-400 mb-3 block">Provider Capabilities</label>
    <div class="flex flex-wrap gap-2">
      {#if capabilities.supportsCallback}
        <span class="px-3 py-1 rounded-full text-xs bg-blue-900/50 text-blue-400">
          🔗 OAuth/OIDC Callback
        </span>
      {/if}
      {#if capabilities.supportsCredentials}
        <span class="px-3 py-1 rounded-full text-xs bg-green-900/50 text-green-400">
          🔑 Credential Authentication
        </span>
      {/if}
      {#if capabilities.supportsSync}
        <span class="px-3 py-1 rounded-full text-xs bg-purple-900/50 text-purple-400">
          🔄 User Synchronization
        </span>
      {/if}
      {#if userSyncEnabled}
        <span class="px-3 py-1 rounded-full text-xs bg-orange-900/50 text-orange-400">
          ⚡ Auto-Sync Active
        </span>
      {/if}
    </div>
  </div>

  <!-- Health Status Indicators -->
  <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="text-center">
      <div class="w-3 h-3 mx-auto rounded-full {validation.valid ? 'bg-green-500' : 'bg-red-500'} mb-1"></div>
      <p class="text-xs text-gray-400">Config</p>
    </div>
    <div class="text-center">
      <div class="w-3 h-3 mx-auto rounded-full bg-gray-500 mb-1"></div>
      <p class="text-xs text-gray-400">Connection</p>
    </div>
    <div class="text-center">
      <div class="w-3 h-3 mx-auto rounded-full {capabilities.supportsSync ? 'bg-green-500' : 'bg-gray-500'} mb-1"></div>
      <p class="text-xs text-gray-400">Sync</p>
    </div>
    <div class="text-center">
      <div class="w-3 h-3 mx-auto rounded-full {userSyncEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-500'} mb-1"></div>
      <p class="text-xs text-gray-400">Auto-Sync</p>
    </div>
  </div>
</div>