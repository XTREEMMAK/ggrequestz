<script>
  let { 
    providerId, 
    definition, 
    config = {},
    onSave = () => {},
    onTest = () => {} 
  } = $props();

  // Reactive form data based on provider type
  let formData = $state({ ...config });

  // Form field configurations for different provider types
  const fieldConfigs = {
    authentik: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'Authentik Application Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: 'Authentik Application Client Secret' },
      { key: 'issuer', label: 'Issuer URL', type: 'url', required: true, placeholder: 'https://auth.example.com/application/o/gamerequest' }
    ],
    oidc_generic: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'OIDC Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: 'OIDC Client Secret' },
      { key: 'issuer', label: 'Issuer URL', type: 'url', required: true, placeholder: 'https://provider.example.com' },
      { key: 'scope', label: 'Scope', type: 'text', required: false, placeholder: 'openid profile email' }
    ],
    api_integration: [
      { key: 'baseUrl', label: 'API Base URL', type: 'url', required: true, placeholder: 'https://your-api.example.com' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your API authentication key' },
      { key: 'userEndpoint', label: 'User Endpoint', type: 'text', required: false, placeholder: '/api/users' },
      { key: 'syncEndpoint', label: 'Sync Endpoint', type: 'text', required: false, placeholder: '/api/users/sync' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'number', required: false, placeholder: '5000' },
      { key: 'enableUserSync', label: 'Enable Auto Sync', type: 'checkbox', required: false }
    ],
    webhook_integration: [
      { key: 'secret', label: 'Webhook Secret', type: 'password', required: true, placeholder: 'Secret for webhook signature validation' },
      { key: 'enableSignatureValidation', label: 'Enable Signature Validation', type: 'checkbox', required: false },
      { key: 'verifyToken', label: 'Verify Token', type: 'text', required: false, placeholder: 'Optional verification token' }
    ],
    local_auth: []
  };

  $effect(() => {
    // Initialize form data with defaults
    const fields = fieldConfigs[providerId] || [];
    for (const field of fields) {
      if (formData[field.key] === undefined) {
        if (field.type === 'checkbox') {
          formData[field.key] = field.key === 'enableSignatureValidation' ? true : false;
        } else if (field.placeholder && !field.required) {
          formData[field.key] = field.placeholder;
        } else {
          formData[field.key] = '';
        }
      }
    }
  });

  function handleSubmit() {
    onSave(formData);
  }

  function handleTest() {
    onTest(formData);
  }
</script>

{#if providerId === 'local_auth'}
  <div class="bg-gray-700/50 rounded-lg p-4">
    <p class="text-sm text-gray-300">
      Local authentication uses traditional username/password login stored in the GameRequest database. 
      No additional configuration required.
    </p>
  </div>
{:else}
  <div class="space-y-4">
    <!-- Dynamic form fields -->
    <div class="grid grid-cols-1 {fieldConfigs[providerId]?.length > 3 ? 'md:grid-cols-2' : ''} gap-4">
      {#each fieldConfigs[providerId] || [] as field}
        <div class="{field.key === 'issuer' || field.key === 'baseUrl' ? 'md:col-span-2' : ''}">
          <label class="block text-sm text-gray-300 mb-2">{field.label}</label>
          
          {#if field.type === 'checkbox'}
            <label class="flex items-center">
              <input 
                type="checkbox" 
                bind:checked={formData[field.key]}
                class="mr-2"
              />
              <span class="text-sm text-gray-300">{field.placeholder || field.label}</span>
            </label>
          {:else}
            <input 
              type={field.type}
              bind:value={formData[field.key]}
              placeholder={field.placeholder}
              required={field.required}
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
            />
          {/if}
        </div>
      {/each}
    </div>

    <!-- Special sections for specific providers -->
    {#if providerId === 'webhook_integration'}
      <div class="bg-gray-700/50 rounded-lg p-4">
        <h4 class="text-sm font-medium text-white mb-2">Webhook URL</h4>
        <code class="text-sm text-blue-400 bg-gray-800 px-2 py-1 rounded">
          {location?.origin || 'https://your-domain.com'}/api/integrations/webhook
        </code>
        <p class="text-xs text-gray-400 mt-2">Configure your external system to send webhooks to this URL</p>
      </div>
    {/if}

    <!-- Action buttons -->
    <div class="flex gap-3 pt-2">
      <button 
        onclick={handleSubmit}
        type="submit"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        💾 Save Configuration
      </button>
      
      {#if providerId !== 'local_auth' && providerId !== 'webhook_integration'}
        <button 
          onclick={handleTest}
          type="button"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          🧪 Test Connection
        </button>
      {/if}
    </div>
  </div>
{/if}