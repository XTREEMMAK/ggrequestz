<script>
  import ProviderConfigForm from './ProviderConfigForm.svelte';

  let { 
    providerId, 
    definition, 
    isActive = false, 
    config = {},
    onSave = () => {},
    onTest = () => {} 
  } = $props();

  let showForm = $state(false);
  let saveStatus = $state(null);

  function getProviderIcon(category) {
    const icons = {
      oidc: '🔐',
      api: '🔄', 
      webhook: '📡',
      local: '👤'
    };
    return icons[category] || '⚙️';
  }

  function getProviderColor(category) {
    const colors = {
      oidc: 'bg-blue-500',
      api: 'bg-purple-500',
      webhook: 'bg-orange-500', 
      local: 'bg-gray-500'
    };
    return colors[category] || 'bg-gray-500';
  }

  async function handleSave(formData) {
    try {
      saveStatus = { loading: true, message: 'Saving...' };
      const result = await onSave(providerId, formData);
      
      if (result.success) {
        saveStatus = { success: true, message: 'Configuration saved successfully' };
        showForm = false;
      } else {
        saveStatus = { error: true, message: result.error };
      }
    } catch (error) {
      saveStatus = { error: true, message: error.message };
    }

    setTimeout(() => { saveStatus = null; }, 3000);
  }

  async function handleTest(formData) {
    try {
      const result = await onTest(providerId, formData);
      
      if (result.success) {
        alert('Connection test successful!');
      } else {
        alert(`Connection test failed: ${result.error}`);
      }
    } catch (error) {
      alert('Connection test failed');
    }
  }
</script>

<div class="border border-gray-700 rounded-lg p-6">
  <!-- Provider Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center">
      <div class="w-10 h-10 rounded-lg {getProviderColor(definition.category)} flex items-center justify-center text-xl mr-4">
        {getProviderIcon(definition.category)}
      </div>
      <div>
        <h3 class="text-lg font-semibold text-white">{definition.name}</h3>
        <p class="text-sm text-gray-400">{definition.description}</p>
      </div>
    </div>
    
    {#if isActive}
      <span class="px-3 py-1 rounded-full text-xs bg-green-900/50 text-green-400">Active</span>
    {/if}
  </div>

  <!-- Capabilities -->
  <div class="mb-4">
    <div class="flex flex-wrap gap-2">
      {#if definition.capabilities.supportsCallback}
        <span class="px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-400">OAuth/OIDC</span>
      {/if}
      {#if definition.capabilities.supportsCredentials}
        <span class="px-2 py-1 rounded text-xs bg-green-900/50 text-green-400">Credentials</span>
      {/if}
      {#if definition.capabilities.supportsSync}
        <span class="px-2 py-1 rounded text-xs bg-purple-900/50 text-purple-400">User Sync</span>
      {/if}
    </div>
  </div>

  <!-- Save Status -->
  {#if saveStatus}
    <div class="mb-4 p-3 rounded {saveStatus.success ? 'bg-green-900/50 text-green-400' : saveStatus.error ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}">
      {saveStatus.message}
    </div>
  {/if}

  <!-- Configuration Form -->
  {#if showForm || isActive}
    <div class="mb-4">
      <ProviderConfigForm 
        {providerId}
        {definition}
        {config}
        onSave={handleSave}
        onTest={handleTest}
      />
    </div>
  {/if}

  <!-- Action Buttons -->
  <div class="flex gap-3">
    <button 
      onclick={() => showForm = !showForm}
      class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
      disabled={saveStatus?.loading}
    >
      {showForm ? '📄 Hide Config' : '⚙️ Configure'}
    </button>

    {#if showForm}
      <button 
        onclick={() => handleSave(config)}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        disabled={saveStatus?.loading}
      >
        {isActive ? '💾 Update' : '🔄 Switch to this Provider'}
      </button>
    {/if}
  </div>
</div>