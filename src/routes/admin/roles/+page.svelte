<!--
  Admin roles management page
-->

<script>
  import { enhance } from '$app/forms';
  import Icon from '@iconify/svelte';
  import { formatDate } from '$lib/utils.js';
  
  let { data, form } = $props();
  let roles = $derived(data?.roles || []);
  let permissionsByCategory = $derived(data?.permissionsByCategory || {});
  
  let selectedRole = $state(null);
  let selectedPermissions = $state(new Set());
  let loading = $state(false);
  let showPermissionModal = $state(false);
  
  // Form feedback
  $effect(() => {
    if (form?.success) {
      selectedRole = null;
      showPermissionModal = false;
      selectedPermissions = new Set();
      
      // Show success message briefly
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  });
  
  function openPermissionModal(role) {
    selectedRole = role;
    selectedPermissions = new Set(role.permissions.map(p => p.id));
    showPermissionModal = true;
  }
  
  function closePermissionModal() {
    selectedRole = null;
    selectedPermissions = new Set();
    showPermissionModal = false;
  }
  
  function togglePermission(permissionId) {
    if (selectedPermissions.has(permissionId)) {
      selectedPermissions.delete(permissionId);
    } else {
      selectedPermissions.add(permissionId);
    }
    selectedPermissions = new Set(selectedPermissions);
  }
  
  function getRolePermissionCount(role) {
    return role.permissions.length;
  }
  
  function getRolePermissionCategories(role) {
    const categories = new Set();
    role.permissions.forEach(p => {
      if (p.category) {
        categories.add(p.category);
      }
    });
    return Array.from(categories);
  }
</script>

<svelte:head>
  <title>Role Management - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Role Management
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Manage roles and assign permissions to control user access
      </p>
    </div>
    
    {#if form?.success}
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        ✅ {form.message}
      </div>
    {:else if form?.error}
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        ❌ {form.error}
      </div>
    {/if}
  </div>

  <!-- Roles List -->
  <div class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
    <div class="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">
        System Roles
      </h3>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Click "Manage Permissions" to assign permissions to each role
      </p>
    </div>
    
    <div class="divide-y divide-gray-200 dark:divide-gray-700">
      {#each roles as role}
        <div class="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                  <div class="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                    <Icon icon="heroicons:shield-check" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center space-x-2">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                      {role.display_name}
                    </p>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      ({role.name})
                    </span>
                    {#if role.is_system}
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        System
                      </span>
                    {/if}
                  </div>
                  <div class="mt-1">
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      {role.description || 'No description available'}
                    </p>
                  </div>
                  <div class="mt-2 flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      <Icon icon="heroicons:key" class="w-3 h-3 inline mr-1" />
                      {getRolePermissionCount(role)} permissions
                    </span>
                    {#if getRolePermissionCategories(role).length > 0}
                      <span>
                        <Icon icon="heroicons:folder" class="w-3 h-3 inline mr-1" />
                        {getRolePermissionCategories(role).join(', ')}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
            
            <div class="flex-shrink-0">
              <button
                type="button"
                onclick={() => openPermissionModal(role)}
                class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <Icon icon="heroicons:cog-6-tooth" class="w-4 h-4 inline mr-1" />
                Manage Permissions
              </button>
            </div>
          </div>
        </div>
      {/each}
      
      {#if roles.length === 0}
        <div class="px-4 py-8 text-center">
          <Icon icon="heroicons:user-group" class="w-12 h-12 mx-auto text-gray-400" />
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No roles found</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            No roles are currently configured in the system.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Permission Assignment Modal -->
{#if showPermissionModal && selectedRole}
  <div class="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div 
        class="fixed inset-0 bg-black bg-opacity-50 transition-opacity z-[95]"
        role="button"
        aria-label="Close modal"
        tabindex="0"
        onclick={closePermissionModal}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            closePermissionModal();
          }
        }}
      ></div>

      <!-- Modal panel -->
      <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full z-[99]">
        <form method="POST" action="?/updateRolePermissions" use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            await update();
            loading = false;
          };
        }}>
          <input type="hidden" name="role_id" value={selectedRole.id} />
          
          <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <!-- Modal header -->
            <div class="sm:flex sm:items-start mb-6">
              <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 sm:mx-0 sm:h-10 sm:w-10">
                <Icon icon="heroicons:key" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                  Manage Permissions for {selectedRole.display_name}
                </h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Select the permissions that users with the "{selectedRole.name}" role should have.
                  </p>
                </div>
              </div>
            </div>

            <!-- Permissions by category -->
            <div class="space-y-6 max-h-96 overflow-y-auto">
              {#each Object.entries(permissionsByCategory) as [category, permissions]}
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h4 class="text-md font-medium text-gray-900 dark:text-white mb-3 capitalize">
                    {category.replace('_', ' ')}
                  </h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#each permissions as permission}
                      <label class="flex items-start">
                        <input
                          type="checkbox"
                          name="permission_ids"
                          value={permission.id}
                          checked={selectedPermissions.has(permission.id)}
                          onchange={() => togglePermission(permission.id)}
                          class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 mt-0.5"
                        />
                        <div class="ml-3 min-w-0">
                          <div class="text-sm font-medium text-gray-900 dark:text-white">
                            {permission.display_name}
                          </div>
                          {#if permission.description}
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                              {permission.description}
                            </div>
                          {/if}
                        </div>
                      </label>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Modal footer -->
          <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="submit"
              disabled={loading}
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              {#if loading}
                <Icon icon="heroicons:arrow-path" class="w-4 h-4 mr-2 animate-spin" />
                Saving...
              {:else}
                <Icon icon="heroicons:check" class="w-4 h-4 mr-2" />
                Save Permissions
              {/if}
            </button>
            <button
              type="button"
              onclick={closePermissionModal}
              disabled={loading}
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}