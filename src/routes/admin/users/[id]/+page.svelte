<!--
  Admin user detail view
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import LoadingSpinner from '../../../../components/LoadingSpinner.svelte';
  import StatusBadge from '../../../../components/StatusBadge.svelte';
  import { formatDate } from '$lib/utils.js';
  import { toasts } from '$lib/stores/toast.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let user = $derived(data?.user);
  let requests = $derived(data?.requests || []);
  let analytics = $derived(data?.analytics || []);
  let stats = $derived(data?.stats || {});
  let userPermissions = $derived(data?.userPermissions || []);
  
  let loading = $state(false);

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  
  // Permission checks
  let canEdit = $derived(userPermissions.includes('user.edit'));
  let canBan = $derived(userPermissions.includes('user.ban'));
  let canDelete = $derived(userPermissions.includes('user.delete'));
  
  async function updateUserStatus(action, value = null) {
    loading = true;
    try {
      const response = await fetch('/admin/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          action: action,
          value: value
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Show success message and refresh the page
        toasts.success(`User ${action === 'toggle_active' ? (user.is_active ? 'deactivated' : 'activated') : 'updated'} successfully!`);
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Update user error:', error);
      toasts.error('Failed to update user: ' + error.message);
    } finally {
      loading = false;
    }
  }
  
  function getUserStatusBadge(user) {
    if (!user.is_active) {
      return { text: 'Inactive', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
    }
    return { text: 'Active', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  }
  
  function getRoleBadges(userRoles) {
    if (!userRoles || userRoles.length === 0) {
      return [{ text: 'No Role', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' }];
    }
    
    return userRoles.map(role => {
      const roleColors = {
        admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        viewer: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      };
      return {
        text: role.display_name || role.name,
        class: roleColors[role.name] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      };
    });
  }
  
  function getActivityIcon(action) {
    const icons = {
      'login': 'heroicons:arrow-right-end-on-rectangle',
      'request_created': 'heroicons:plus-circle',
      'admin_request_updated': 'heroicons:pencil-square',
      'profile_updated': 'heroicons:user-circle',
      'default': 'heroicons:document-text'
    };
    return icons[action] || icons.default;
  }
  
  function formatActivityAction(action) {
    const actionLabels = {
      'login': 'Login',
      'request_created': 'Request Created',
      'admin_request_updated': 'Request Updated (Admin)',
      'profile_updated': 'Profile Updated',
      'admin_user_updated': 'User Updated (Admin)'
    };
    return actionLabels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
  <title>{user?.name || user?.email} - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header with navigation -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-4">
      <button
        type="button"
        onclick={() => goto('/admin/users')}
        class="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <Icon icon="heroicons:arrow-left" class="w-5 h-5 mr-2" />
        Back to Users
      </button>
    </div>
    
    <div class="flex items-center space-x-3">
      {#if canEdit}
        <button
          type="button"
          onclick={() => goto(`/admin/users/${user.id}/edit`)}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Icon icon="heroicons:pencil" class="w-4 h-4 mr-2 inline" />
          Edit User
        </button>
      {/if}
    </div>
  </div>

  <!-- User profile card -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-4">
          <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl font-medium">
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {user?.name || user?.preferred_username || 'User'}
            </h1>
            <p class="text-gray-600 dark:text-gray-400">
              {user?.email}
            </p>
            {#if user?.preferred_username}
              <p class="text-sm text-gray-500 dark:text-gray-400">
                @{user.preferred_username}
              </p>
            {/if}
            
            <div class="flex items-center space-x-2 mt-2">
              {#each [getUserStatusBadge(user)] as statusBadge}
                <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {statusBadge.class}">
                  {statusBadge.text}
                </span>
              {/each}
              
              {#each getRoleBadges(user.roles) as roleBadge}
                <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {roleBadge.class}">
                  {roleBadge.text}
                </span>
              {/each}
            </div>
          </div>
        </div>
        
        <div class="text-right text-sm text-gray-500 dark:text-gray-400">
          <p>User ID: {user?.id}</p>
          <p>Joined: {formatDate(user?.created_at)}</p>
          <p>Last login: {user?.last_login ? formatDate(user.last_login) : 'Never'}</p>
        </div>
      </div>
    </div>
    
    <!-- Quick actions -->
    {#if canEdit || canBan}
      <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quick Actions</h3>
        <div class="flex items-center space-x-3">
          {#if canEdit}
            <button
              type="button"
              onclick={() => showConfirmation(
                `${user.is_active ? 'Deactivate' : 'Activate'} User`,
                `Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} this user?`,
                () => updateUserStatus('toggle_active')
              )}
              disabled={loading}
              class="px-3 py-1.5 text-sm font-medium rounded transition-colors"
              class:bg-green-600={!user.is_active}
              class:hover:bg-green-700={!user.is_active}
              class:text-white={!user.is_active || user.is_active}
              class:bg-yellow-600={user.is_active}
              class:hover:bg-yellow-700={user.is_active}
            >
              {#if loading}
                <LoadingSpinner size="sm" />
              {:else}
                {user.is_active ? 'Deactivate' : 'Activate'}
              {/if}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Stats and activity grid -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Request statistics -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Request Statistics
        </h2>
      </div>
      
      <div class="p-6">
        <div class="grid grid-cols-2 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total_requests || 0}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Total Requests</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-600">
              {stats.pending_requests || 0}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">
              {stats.approved_requests || 0}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Approved</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">
              {stats.fulfilled_requests || 0}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Fulfilled</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Recent activity -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h2>
      </div>
      
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each analytics.slice(0, 5) as activity}
          <div class="p-4">
            <div class="flex items-center space-x-3">
              <Icon icon={getActivityIcon(activity.action)} class="w-5 h-5 text-gray-400" />
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  {formatActivityAction(activity.action)}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {activity.count} times • Last: {formatDate(activity.last_action)}
                </p>
              </div>
            </div>
          </div>
        {:else}
          <div class="p-8 text-center text-gray-500 dark:text-gray-400">
            <Icon icon="heroicons:chart-bar" class="w-12 h-12 mx-auto mb-4" />
            <p>No activity recorded</p>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Recent requests -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Requests
        </h2>
        {#if requests.length > 0}
          <a
            href="/admin/requests?search={encodeURIComponent(user.email)}"
            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            View all →
          </a>
        {/if}
      </div>
    </div>
    
    <div class="divide-y divide-gray-200 dark:divide-gray-700">
      {#each requests as request}
        <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                <a href="/admin/requests/{request.id}" class="hover:text-blue-600">
                  {request.title}
                </a>
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatDate(request.created_at)}
                {#if request.updated_at !== request.created_at}
                  • Updated {formatDate(request.updated_at)}
                {/if}
              </p>
            </div>
            <div class="flex items-center space-x-2">
              <StatusBadge status={request.status} />
              <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                {request.request_type}
              </span>
            </div>
          </div>
        </div>
      {:else}
        <div class="p-8 text-center text-gray-500 dark:text-gray-400">
          <Icon icon="heroicons:clipboard-document-list" class="w-12 h-12 mx-auto mb-4" />
          <p>No requests submitted</p>
        </div>
      {/each}
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