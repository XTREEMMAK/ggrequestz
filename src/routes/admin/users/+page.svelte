<!--
  Admin user management interface
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  let users = $state(data?.users || []);
  let roles = $derived(data?.roles || []);
  let userPermissions = $derived(data?.userPermissions || []);
  let currentPage = $derived(data?.currentPage || 1);
  let totalPages = $derived(data?.totalPages || 1);
  let totalUsers = $derived(data?.totalUsers || 0);
  let sorting = $derived(data?.sorting || { sortBy: 'created_at', sortDir: 'desc' });
  
  let loading = $state(false);
  let selectedUsers = $state(new Set());
  let pageUrl = $derived($page.url);
  
  // Get filter state directly from URL to ensure button states are correct (matching admin requests pattern)
  let currentSearch = $derived($page.url.searchParams.get('search') || '');
  let currentRole = $derived($page.url.searchParams.get('role') || 'all');
  let currentStatus = $derived($page.url.searchParams.get('status') || 'all');
  
  // Track URL changes for filtering/sorting (matching admin requests pattern)
  let previousUrl = $state('');
  
  $effect(() => {
    const currentUrl = pageUrl.toString();
    if (currentUrl !== previousUrl && previousUrl !== '') {
      // URL has changed, invalidate to reload data
      invalidateAll();
    }
    previousUrl = currentUrl;
  });
  
  // Update local state when data changes (matching admin requests pattern)
  $effect(() => {
    users = data?.users || [];
  });
  
  
  // Permission checks
  let canEdit = $derived(userPermissions.includes('user.edit'));
  let canBan = $derived(userPermissions.includes('user.ban'));
  let canDelete = $derived(userPermissions.includes('user.delete'));
  
  // Filter options  
  let statusFilters = [
    { value: 'all', label: 'All Users' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'banned', label: 'Banned' }
  ];
  
  let roleFilters = $derived([
    { value: 'all', label: 'All Roles' },
    ...roles.map(role => ({ value: role.name, label: role.display_name }))
  ]);
  
  function handleStatusFilterChange(status) {
    const url = new URL(pageUrl);
    if (status === 'all') {
      url.searchParams.delete('status');
    } else {
      url.searchParams.set('status', status);
    }
    url.searchParams.delete('page'); // Reset to first page
    goto(url.toString());
  }
  
  function handleRoleFilterChange(role) {
    const url = new URL(pageUrl);
    if (role === 'all') {
      url.searchParams.delete('role');
    } else {
      url.searchParams.set('role', role);
    }
    url.searchParams.delete('page'); // Reset to first page
    goto(url.toString());
  }
  
  function handleSearch(event) {
    const query = event.target.value;
    const url = new URL(pageUrl);
    if (query) {
      url.searchParams.set('search', query);
    } else {
      url.searchParams.delete('search');
    }
    url.searchParams.delete('page'); // Reset to first page
    goto(url.toString());
  }
  
  function handlePageChange(page) {
    const url = new URL(pageUrl);
    if (page > 1) {
      url.searchParams.set('page', page.toString());
    } else {
      url.searchParams.delete('page');
    }
    goto(url.toString());
  }
  
  function handleSort(column) {
    const url = new URL(pageUrl);
    
    // If clicking the same column, toggle direction
    if (sorting.sortBy === column) {
      url.searchParams.set('dir', sorting.sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, set to desc by default
      url.searchParams.set('sort', column);
      url.searchParams.set('dir', 'desc');
    }
    
    url.searchParams.delete('page'); // Reset to first page
    goto(url.toString());
  }
  
  function getSortIcon(column) {
    if (sorting.sortBy !== column) return 'heroicons:bars-arrow-up';
    return sorting.sortDir === 'asc' ? 'heroicons:bars-arrow-up' : 'heroicons:bars-arrow-down';
  }
  
  function toggleUserSelection(userId) {
    if (selectedUsers.has(userId)) {
      selectedUsers.delete(userId);
    } else {
      selectedUsers.add(userId);
    }
    selectedUsers = new Set(selectedUsers); // Trigger reactivity
  }
  
  function selectAllUsers() {
    if (selectedUsers.size === users.length) {
      selectedUsers.clear();
    } else {
      selectedUsers = new Set(users.map(u => u.id));
    }
  }
  
  async function updateUserStatus(userId, action, value = null) {
    loading = true;
    try {
      const response = await fetch('/admin/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          action: action,
          value: value
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Update local state
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex >= 0) {
          if (action === 'toggle_active') {
            users[userIndex] = { ...users[userIndex], is_active: !users[userIndex].is_active };
          } else if (action === 'assign_role') {
            // Refresh to get updated roles
            window.location.reload();
            return;
          }
        }
        selectedUsers.delete(userId);
        selectedUsers = new Set(selectedUsers);
      } else {
        throw new Error(result.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Update user error:', error);
      alert('Failed to update user: ' + error.message);
    } finally {
      loading = false;
    }
  }
  
  async function bulkUpdateUsers(action, value = null) {
    if (selectedUsers.size === 0) return;
    
    const actionLabels = {
      activate: 'activate',
      deactivate: 'deactivate',
      delete: 'delete'
    };
    
    if (!confirm(`Are you sure you want to ${actionLabels[action]} ${selectedUsers.size} user(s)?`)) return;
    
    loading = true;
    try {
      const response = await fetch('/admin/api/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_ids: Array.from(selectedUsers),
          action: action,
          value: value
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Refresh the page to get updated data
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to update users');
      }
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('Failed to update users: ' + error.message);
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
  
  function getRoleBadges(user) {
    const badges = [];
    
    // For basic auth users, show admin status directly from is_admin field
    if (user.auth_type === 'basic') {
      if (user.is_admin) {
        badges.push({ text: 'Administrator', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' });
      } else {
        badges.push({ text: 'Basic User', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' });
      }
    } else {
      // For Authentik users, show their roles
      const userRoles = user.roles || [];
      if (userRoles.length === 0) {
        badges.push({ text: 'No Role', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' });
      } else {
        userRoles.forEach(role => {
          const roleColors = {
            admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
            manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            viewer: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          };
          badges.push({
            text: role.display_name || role.name,
            class: roleColors[role.name] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
          });
        });
      }
    }
    
    return badges;
  }
</script>

<svelte:head>
  <title>User Management - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        User Management
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Manage user accounts, roles, and permissions
      </p>
    </div>
    
    <div class="flex items-center space-x-3">
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {totalUsers} total users
      </span>
    </div>
  </div>
  
  <!-- Filters and search -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <!-- Status filters -->
      <div class="flex flex-wrap gap-2">
        <div class="flex items-center space-x-1">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
          {#each statusFilters as filter}
            <button
              type="button"
              onclick={() => handleStatusFilterChange(filter.value)}
              class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              class:bg-blue-600={currentStatus === filter.value}
              class:text-white={currentStatus === filter.value}
              class:bg-gray-100={currentStatus !== filter.value}
              class:text-gray-700={currentStatus !== filter.value}
              class:dark:bg-gray-700={currentStatus !== filter.value}
              class:dark:text-gray-300={currentStatus !== filter.value}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      </div>
      
      <!-- Role filters -->
      <div class="flex flex-wrap gap-2">
        <div class="flex items-center space-x-1">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Role:</span>
          {#each roleFilters as filter}
            <button
              type="button"
              onclick={() => handleRoleFilterChange(filter.value)}
              class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              class:bg-blue-600={currentRole === filter.value}
              class:text-white={currentRole === filter.value}
              class:bg-gray-100={currentRole !== filter.value}
              class:text-gray-700={currentRole !== filter.value}
              class:dark:bg-gray-700={currentRole !== filter.value}
              class:dark:text-gray-300={currentRole !== filter.value}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      </div>
      
      <!-- Search -->
      <div class="flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search users..."
          value={currentSearch}
          oninput={handleSearch}
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  </div>
  
  <!-- Bulk actions -->
  {#if selectedUsers.size > 0}
    <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
          {selectedUsers.size} user(s) selected
        </span>
        
        <div class="flex items-center space-x-2">
          {#if canEdit}
            <button
              type="button"
              onclick={() => bulkUpdateUsers('activate')}
              class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
            >
              Activate
            </button>
            <button
              type="button"
              onclick={() => bulkUpdateUsers('deactivate')}
              class="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded transition-colors"
            >
              Deactivate
            </button>
          {/if}
          
          {#if canDelete}
            <button
              type="button"
              onclick={() => bulkUpdateUsers('delete')}
              class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
            >
              Delete
            </button>
          {/if}
          
          <button
            type="button"
            onclick={() => { selectedUsers.clear(); selectedUsers = new Set(); }}
            class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Users table -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    {#if loading}
      <div class="p-8 text-center">
        <LoadingSpinner size="lg" text="Loading users..." />
      </div>
    {:else if users.length > 0}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedUsers.size === users.length && users.length > 0}
                  onchange={selectAllUsers}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('name')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>User</span>
                  <Icon 
                    icon={getSortIcon('name')} 
                    class="w-3 h-3 {sorting.sortBy === 'name' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Roles
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('is_active')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Status</span>
                  <Icon 
                    icon={getSortIcon('is_active')} 
                    class="w-3 h-3 {sorting.sortBy === 'is_active' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('last_login')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Last Login</span>
                  <Icon 
                    icon={getSortIcon('last_login')} 
                    class="w-3 h-3 {sorting.sortBy === 'last_login' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('created_at')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Joined</span>
                  <Icon 
                    icon={getSortIcon('created_at')} 
                    class="w-3 h-3 {sorting.sortBy === 'created_at' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each users as user}
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onchange={() => toggleUserSelection(user.id)}
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                
                <td class="px-6 py-4">
                  <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <span class="text-white font-medium">
                        {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">
                        {user.name || user.preferred_username || 'User'}
                      </p>
                      <div class="flex items-center space-x-2">
                        <p class="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {user.email}
                        </p>
                        <span class="inline-flex px-1.5 py-0.5 text-xs font-medium rounded" 
                              class:bg-blue-100={user.auth_type === 'authentik'}
                              class:text-blue-800={user.auth_type === 'authentik'}
                              class:bg-green-100={user.auth_type === 'basic'}
                              class:text-green-800={user.auth_type === 'basic'}>
                          {user.auth_type === 'basic' ? 'Basic' : 'Authentik'}
                        </span>
                      </div>
                      {#if user.preferred_username}
                        <p class="text-xs text-gray-400 dark:text-gray-500">
                          @{user.preferred_username}
                        </p>
                      {/if}
                    </div>
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  <div class="flex flex-wrap gap-1">
                    {#each getRoleBadges(user) as roleBadge}
                      <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {roleBadge.class}">
                        {roleBadge.text}
                      </span>
                    {/each}
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  {#each [getUserStatusBadge(user)] as statusBadge}
                    <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {statusBadge.class}">
                      {statusBadge.text}
                    </span>
                  {/each}
                </td>
                
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {user.last_login ? formatDate(user.last_login) : 'Never'}
                </td>
                
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(user.created_at)}
                </td>
                
                <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
                  {#if canEdit}
                    <button
                      type="button"
                      onclick={() => updateUserStatus(user.id, 'toggle_active')}
                      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  {/if}
                  
                  {#if canEdit}
                    <button
                      type="button"
                      onclick={() => goto(`/admin/users/${user.id}/edit`)}
                      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Edit
                    </button>
                  {/if}
                  
                  <button
                    type="button"
                    onclick={() => goto(`/admin/users/${user.id}`)}
                    class="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    View
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="bg-gray-50 dark:bg-gray-700 px-6 py-3 border-t border-gray-200 dark:border-gray-600">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700 dark:text-gray-300">
              Page {currentPage} of {totalPages}
            </div>
            
            <div class="flex items-center space-x-2">
              <button
                type="button"
                onclick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                class="px-3 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              
              {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                return page;
              }) as pageNum}
                <button
                  type="button"
                  onclick={() => handlePageChange(pageNum)}
                  class="px-3 py-1 text-sm rounded transition-colors"
                  class:bg-blue-600={pageNum === currentPage}
                  class:text-white={pageNum === currentPage}
                  class:bg-white={pageNum !== currentPage}
                  class:dark:bg-gray-800={pageNum !== currentPage}
                  class:border={pageNum !== currentPage}
                  class:border-gray-300={pageNum !== currentPage}
                  class:dark:border-gray-600={pageNum !== currentPage}
                  class:text-gray-700={pageNum !== currentPage}
                  class:dark:text-gray-300={pageNum !== currentPage}
                  class:hover:bg-gray-50={pageNum !== currentPage}
                  class:dark:hover:bg-gray-700={pageNum !== currentPage}
                >
                  {pageNum}
                </button>
              {/each}
              
              <button
                type="button"
                onclick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                class="px-3 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <div class="p-8 text-center">
        <Icon icon="heroicons:users" class="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No users found
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          {#if currentStatus !== 'all' || currentRole !== 'all' || currentSearch}
            Try adjusting your filters or search query.
          {:else}
            No users have registered yet.
          {/if}
        </p>
      </div>
    {/if}
  </div>
</div>