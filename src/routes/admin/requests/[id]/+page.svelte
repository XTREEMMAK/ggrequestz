<!--
  Admin request detail view
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import StatusBadge from '../../../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let request = $derived(data?.request);
  let requestUser = $derived(data?.requestUser);
  let userPermissions = $derived(data?.userPermissions || []);
  
  let loading = $state(false);
  
  // Permission checks
  let canApprove = $derived(userPermissions.includes('request.approve'));
  let canEdit = $derived(userPermissions.includes('request.edit'));
  let canDelete = $derived(userPermissions.includes('request.delete'));
  
  async function updateRequestStatus(newStatus, adminNotes = '') {
    loading = true;
    try {
      const response = await fetch('/admin/api/requests/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: request.id,
          status: newStatus,
          admin_notes: adminNotes
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Refresh the page to get updated data
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to update request');
      }
    } catch (error) {
      console.error('Update request error:', error);
      alert('Failed to update request: ' + error.message);
    } finally {
      loading = false;
    }
  }
  
  function getPriorityColor(priority) {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }
  
  function getRequestTypeColor(type) {
    switch (type) {
      case 'game': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'update': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'fix': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }
</script>

<svelte:head>
  <title>Request #{request?.id} - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header with navigation -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-4">
      <button
        type="button"
        onclick={() => goto('/admin/requests')}
        class="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <Icon icon="heroicons:arrow-left" class="w-5 h-5 mr-2" />
        Back to Requests
      </button>
    </div>
    
    <div class="flex items-center space-x-3">
      {#if canEdit}
        <button
          type="button"
          onclick={() => goto(`/admin/requests/${request.id}/edit`)}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Icon icon="heroicons:pencil" class="w-4 h-4 mr-2 inline" />
          Edit Request
        </button>
      {/if}
    </div>
  </div>

  <!-- Request details card -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {request?.title}
          </h1>
          
          <div class="flex items-center space-x-4 mb-4">
            <StatusBadge status={request?.status} />
            <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {getPriorityColor(request?.priority)}">
              {request?.priority} priority
            </span>
            <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {getRequestTypeColor(request?.request_type)}">
              {request?.request_type}
            </span>
          </div>
        </div>
        
        <div class="text-right text-sm text-gray-500 dark:text-gray-400">
          <p>Request #{request?.id}</p>
          <p>Created {formatDate(request?.created_at)}</p>
          {#if request?.updated_at !== request?.created_at}
            <p>Updated {formatDate(request?.updated_at)}</p>
          {/if}
        </div>
      </div>
    </div>
    
    <div class="w-full max-w-none space-y-6 p-6">
      <!-- Request details grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Request information -->
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            Request Details
          </h2>
          
          <div class="space-y-3">
            <div>
              <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </div>
              <div class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                  {request?.description || 'No description provided'}
                </p>
              </div>
            </div>
            
            {#if request?.reason}
              <div>
                <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason
                </div>
                <div class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p class="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                    {request.reason}
                  </p>
                </div>
              </div>
            {/if}
            
            {#if request?.platforms && request.platforms.length > 0}
              <div>
                <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Platforms
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each request.platforms as platform}
                    <span class="inline-flex px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-medium rounded">
                      {platform}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
            
            {#if request?.admin_notes}
              <div>
                <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Admin Notes
                </div>
                <div class="p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                  <p class="text-sm text-yellow-900 dark:text-yellow-100 whitespace-pre-wrap">
                    {request.admin_notes}
                  </p>
                </div>
              </div>
            {/if}
          </div>
        </div>
        
        <!-- User information -->
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            Requested By
          </h2>
          
          {#if requestUser}
            <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div class="flex items-center space-x-3 mb-3">
                <div class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white font-medium">
                    {requestUser.name?.charAt(0)?.toUpperCase() || requestUser.email?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white">
                    {requestUser.name || requestUser.preferred_username || 'User'}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {requestUser.email}
                  </p>
                  {#if requestUser.preferred_username}
                    <p class="text-xs text-gray-400 dark:text-gray-500">
                      @{requestUser.preferred_username}
                    </p>
                  {/if}
                </div>
              </div>
              
              <div class="space-y-2">
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  <p>Joined: {formatDate(requestUser.created_at)}</p>
                  <p>Last login: {requestUser.last_login ? formatDate(requestUser.last_login) : 'Never'}</p>
                </div>
                
                {#if requestUser.roles && requestUser.roles.length > 0}
                  <div>
                    <div class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Roles
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each requestUser.roles as role}
                        <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">
                          {role.display_name || role.name}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
              
              <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  onclick={() => goto(`/admin/users/${requestUser.id}`)}
                  class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  View user profile →
                </button>
              </div>
            </div>
          {:else}
            <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                User information not available
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Actions -->
  {#if canApprove && request?.status === 'pending'}
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Quick Actions
      </h2>
      
      <div class="flex items-center space-x-4">
        <button
          type="button"
          onclick={() => updateRequestStatus('approved')}
          disabled={loading}
          class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {#if loading}
            <LoadingSpinner size="sm" />
          {:else}
            <Icon icon="heroicons:check" class="w-4 h-4 mr-2 inline" />
            Approve Request
          {/if}
        </button>
        
        <button
          type="button"
          onclick={() => updateRequestStatus('rejected')}
          disabled={loading}
          class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {#if loading}
            <LoadingSpinner size="sm" />
          {:else}
            <Icon icon="heroicons:x-mark" class="w-4 h-4 mr-2 inline" />
            Reject Request
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>