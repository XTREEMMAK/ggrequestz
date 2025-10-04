<!--
  Admin API Keys Management Interface
-->

<script>
  import { invalidateAll } from '$app/navigation';
  import { fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import { toasts } from '$lib/stores/toast.js';
  import Icon from '@iconify/svelte';

  let { data } = $props();
  let keys = $derived(data?.keys || []);
  let availableScopes = $derived(data?.availableScopes || {});
  let scopeDescriptions = $derived(data?.scopeDescriptions || {});

  let loading = $state(false);
  let showCreateModal = $state(false);
  let showKeyModal = $state(false);
  let showConfirmModal = $state(false);
  let newlyCreatedKey = $state(null);
  let pendingAction = $state(null); // { action: 'revoke'|'delete', keyId, keyName }

  // Create form state
  let createForm = $state({
    name: '',
    selectedScopes: [],
    expires_at: ''
  });

  // Copy feedback
  let copyFeedback = $state('');

  // Reset create form
  function resetCreateForm() {
    createForm = {
      name: '',
      selectedScopes: [],
      expires_at: ''
    };
  }

  // Toggle scope selection
  function toggleScope(scope) {
    if (createForm.selectedScopes.includes(scope)) {
      createForm.selectedScopes = createForm.selectedScopes.filter(s => s !== scope);
    } else {
      createForm.selectedScopes = [...createForm.selectedScopes, scope];
    }
  }

  // Create new API key
  async function createApiKey() {
    if (!createForm.name.trim()) {
      toasts.error('Please enter a name for the API key');
      return;
    }

    if (createForm.selectedScopes.length === 0) {
      toasts.error('Please select at least one scope');
      return;
    }

    loading = true;

    try {
      const response = await fetch('/admin/api/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          scopes: createForm.selectedScopes,
          expires_at: createForm.expires_at || null
        })
      });

      const result = await response.json();

      if (result.success) {
        newlyCreatedKey = result;
        showCreateModal = false;
        showKeyModal = true;
        resetCreateForm();
        toasts.success('API key created successfully!');
        await invalidateAll();
      } else {
        throw new Error(result.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Create API key error:', error);
      toasts.error('Failed to create API key: ' + error.message);
    } finally {
      loading = false;
    }
  }

  // Show confirmation modal for revoke
  function confirmRevokeKey(keyId, keyName) {
    pendingAction = { action: 'revoke', keyId, keyName };
    showConfirmModal = true;
  }

  // Show confirmation modal for delete
  function confirmDeleteKey(keyId, keyName) {
    pendingAction = { action: 'delete', keyId, keyName };
    showConfirmModal = true;
  }

  // Execute the pending action
  async function executePendingAction() {
    if (!pendingAction) return;

    showConfirmModal = false;

    if (pendingAction.action === 'revoke') {
      await revokeKey(pendingAction.keyId, pendingAction.keyName);
    } else if (pendingAction.action === 'delete') {
      await deleteKey(pendingAction.keyId, pendingAction.keyName);
    }

    pendingAction = null;
  }

  // Revoke API key
  async function revokeKey(keyId, keyName) {
    loading = true;

    try {
      const response = await fetch('/admin/api/keys/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId })
      });

      const result = await response.json();

      if (result.success) {
        toasts.success('API key revoked successfully');
        await invalidateAll();
      } else {
        throw new Error(result.error || 'Failed to revoke API key');
      }
    } catch (error) {
      console.error('Revoke API key error:', error);
      toasts.error('Failed to revoke API key: ' + error.message);
    } finally {
      loading = false;
    }
  }

  // Delete API key
  async function deleteKey(keyId, keyName) {
    loading = true;

    try {
      const response = await fetch('/admin/api/keys/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId })
      });

      const result = await response.json();

      if (result.success) {
        toasts.success('API key deleted successfully');
        await invalidateAll();
      } else {
        throw new Error(result.error || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Delete API key error:', error);
      toasts.error('Failed to delete API key: ' + error.message);
    } finally {
      loading = false;
    }
  }

  // Copy to clipboard
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      copyFeedback = 'Copied!';
      setTimeout(() => { copyFeedback = ''; }, 2000);
      toasts.success('Copied to clipboard');
    } catch (error) {
      console.error('Copy failed:', error);
      toasts.error('Failed to copy to clipboard');
    }
  }
</script>

<!-- Header -->
<div class="mb-6 flex items-center justify-between">
  <div>
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">API Keys</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      Manage API keys for programmatic access to your application
    </p>
  </div>
  <button
    type="button"
    onclick={() => showCreateModal = true}
    disabled={loading}
    class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
  >
    <Icon icon="heroicons:plus" class="w-5 h-5" />
    <span>Create API Key</span>
  </button>
</div>

<!-- API Keys List -->
{#if keys.length === 0}
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center" transition:fade={{ duration: 200 }}>
    <Icon icon="heroicons:key" class="w-16 h-16 mx-auto text-gray-400 mb-4" />
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
      No API Keys
    </h3>
    <p class="text-gray-600 dark:text-gray-400 mb-6">
      Create your first API key to start using the API programmatically
    </p>
    <button
      onclick={() => showCreateModal = true}
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center space-x-2"
    >
      <Icon icon="heroicons:plus" class="w-5 h-5" />
      <span>Create API Key</span>
    </button>
  </div>
{:else}
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" transition:fade={{ duration: 200 }}>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Key Prefix</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Scopes</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Used</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Expires</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each keys as key (key.id)}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" transition:slide={{ duration: 200, easing: cubicOut }}>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900 dark:text-white">{key.name}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <code class="bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                  {key.key_prefix}...
                </code>
              </td>
              <td class="px-6 py-4">
                <div class="flex flex-wrap gap-1">
                  {#each key.scopes as scope}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {scope}
                    </span>
                  {/each}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{key.last_used_formatted}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{key.created_at_formatted}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                {#if key.is_expired}
                  <span class="text-red-600 dark:text-red-400 font-medium">Expired</span>
                {:else}
                  <span class="text-gray-500 dark:text-gray-400">{key.expires_at_formatted}</span>
                {/if}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                {#if key.is_expired}
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    Expired
                  </span>
                {:else if !key.is_active}
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Revoked
                  </span>
                {:else}
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Active
                  </span>
                {/if}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex gap-2">
                  {#if key.is_active && !key.is_expired}
                    <button
                      onclick={() => confirmRevokeKey(key.id, key.name)}
                      disabled={loading}
                      title="Revoke this API key"
                      class="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 disabled:opacity-50 transition-colors"
                    >
                      <Icon icon="heroicons:no-symbol" class="w-5 h-5" />
                    </button>
                  {/if}
                  <button
                    onclick={() => confirmDeleteKey(key.id, key.name)}
                    disabled={loading}
                    title="Delete this API key"
                    class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    <Icon icon="heroicons:trash" class="w-5 h-5" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<!-- Create API Key Modal -->
{#if showCreateModal}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    onclick={() => { showCreateModal = false; resetCreateForm(); }}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
      transition:slide={{ duration: 300, easing: cubicOut }}
    >
      <div class="p-6">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-6">Create New API Key</h3>

        <div class="space-y-6">
          <!-- Name -->
          <div>
            <label for="key-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Name <span class="text-red-500">*</span>
            </label>
            <input
              id="key-name"
              type="text"
              bind:value={createForm.name}
              placeholder="My API Key"
              maxlength="255"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              A descriptive name to identify this API key
            </p>
          </div>

          <!-- Scopes -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Scopes <span class="text-red-500">*</span>
            </label>
            <div class="space-y-2 max-h-64 overflow-y-auto p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              {#each Object.entries(availableScopes) as [key, scope]}
                <label class="flex items-start gap-3 cursor-pointer hover:bg-white dark:hover:bg-gray-600 p-2 rounded transition-colors">
                  <input
                    type="checkbox"
                    class="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    checked={createForm.selectedScopes.includes(scope)}
                    onchange={() => toggleScope(scope)}
                  />
                  <div class="flex-1">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">{scope}</div>
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      {scopeDescriptions[scope] || 'No description available'}
                    </div>
                  </div>
                </label>
              {/each}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select at least one scope for this API key
            </p>
          </div>

          <!-- Expiration -->
          <div>
            <label for="key-expiration" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Expiration Date (Optional)
            </label>
            <input
              id="key-expiration"
              type="date"
              bind:value={createForm.expires_at}
              min={new Date().toISOString().split('T')[0]}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave empty for a key that never expires
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onclick={() => { showCreateModal = false; resetCreateForm(); }}
            disabled={loading}
            class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={createApiKey}
            disabled={loading || !createForm.name.trim() || createForm.selectedScopes.length === 0}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            {#if loading}
              <LoadingSpinner size="sm" color="white" />
              <span>Creating...</span>
            {:else}
              <Icon icon="heroicons:plus" class="w-5 h-5" />
              <span>Create API Key</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Show New API Key Modal -->
{#if showKeyModal && newlyCreatedKey}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full"
      transition:slide={{ duration: 300, easing: cubicOut }}
    >
      <div class="p-6">
        <!-- Warning Banner -->
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Icon icon="heroicons:exclamation-triangle" class="w-6 h-6 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <div class="text-sm text-yellow-800 dark:text-yellow-200">
            <strong class="font-semibold">Important:</strong> This is the only time you'll see this key. Copy it now and store it securely!
          </div>
        </div>

        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-6">API Key Created Successfully</h3>

        <!-- API Key Display -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Your API Key
          </label>
          <div class="flex gap-2">
            <input
              type="text"
              value={newlyCreatedKey.key}
              readonly
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            />
            <button
              onclick={() => copyToClipboard(newlyCreatedKey.key)}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              {#if copyFeedback}
                <Icon icon="heroicons:check" class="w-5 h-5" />
                <span>Copied!</span>
              {:else}
                <Icon icon="heroicons:clipboard-document" class="w-5 h-5" />
                <span>Copy</span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Usage Example -->
        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">Usage Example:</h4>
          <pre class="text-sm text-gray-800 dark:text-gray-200 overflow-x-auto"><code>curl -H "Authorization: Bearer {newlyCreatedKey.key}" \
  https://your-domain.com/api/games/popular</code></pre>
        </div>

        <!-- Action -->
        <div class="flex justify-end">
          <button
            onclick={() => { showKeyModal = false; newlyCreatedKey = null; }}
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            I've Saved My Key
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Modal -->
{#if showConfirmModal && pendingAction}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    onclick={() => { showConfirmModal = false; pendingAction = null; }}
    transition:fade={{ duration: 200 }}
  >
    <!-- Modal -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
      onclick={(e) => e.stopPropagation()}
      transition:slide={{ duration: 300, easing: cubicOut }}
    >
      <div class="p-6">
        <!-- Icon -->
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
          <Icon icon="heroicons:exclamation-triangle" class="h-6 w-6 text-red-600 dark:text-red-500" />
        </div>

        <!-- Title -->
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
          {pendingAction.action === 'revoke' ? 'Revoke API Key' : 'Delete API Key'}
        </h3>

        <!-- Message -->
        <div class="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
          {#if pendingAction.action === 'revoke'}
            <p class="mb-2">Are you sure you want to revoke the API key:</p>
            <p class="font-medium text-gray-900 dark:text-white mb-2">"{pendingAction.keyName}"</p>
            <p class="text-xs">This action cannot be undone and any applications using this key will lose access immediately.</p>
          {:else}
            <p class="mb-2">Are you sure you want to permanently delete the API key:</p>
            <p class="font-medium text-gray-900 dark:text-white mb-2">"{pendingAction.keyName}"</p>
            <p class="text-xs">This action cannot be undone and will remove all records of this key.</p>
          {/if}
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button
            type="button"
            onclick={() => { showConfirmModal = false; pendingAction = null; }}
            disabled={loading}
            class="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={executePendingAction}
            disabled={loading}
            class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            {#if loading}
              <LoadingSpinner size="sm" color="white" />
              <span>Processing...</span>
            {:else}
              <Icon icon="heroicons:trash" class="w-5 h-5" />
              <span>{pendingAction.action === 'revoke' ? 'Revoke' : 'Delete'}</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
