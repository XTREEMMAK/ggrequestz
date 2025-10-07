<!--
  Admin user edit form
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import LoadingSpinner from '../../../../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import { toasts } from '$lib/stores/toast.js';
  import Icon from '@iconify/svelte';

  let { data, form } = $props();
  let user = $derived(data?.user);
  let availableRoles = $derived(data?.availableRoles || []);
  let userPermissions = $derived(data?.userPermissions || []);
  let adminProtection = $derived(data?.adminProtection || { isCurrentUser: false, isLastActiveAdmin: false, canModifyUser: true });

  let loading = $state(false);
  let roleLoading = $state(false);

  // Form fields
  let name = $state('');
  let email = $state('');
  let preferredUsername = $state('');
  let isActive = $state(false);
  let selectedRoleId = $state('');

  // Initialize form fields when user data is available
  $effect(() => {
    if (user) {
      name = user.name || '';
      email = user.email || '';
      preferredUsername = user.preferred_username || '';
      isActive = user.is_active || false;
    }
  });

  // Filter available roles to exclude ones already assigned
  let unassignedRoles = $derived(
    availableRoles.filter(role =>
      !user.roles.some(userRole => userRole.id === role.id)
    )
  );

  $effect(() => {
    if (form?.success) {
      toasts.success('User updated successfully');
      // Refresh page to show updated data
      window.location.reload();
    } else if (form?.error) {
      toasts.error(form.error);
    }
  });
  
  function getUserStatusBadge(user) {
    if (!user.is_active) {
      return { text: 'Inactive', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
    }
    return { text: 'Active', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  }
  
  function getRoleBadgeClass(roleName) {
    const roleColors = {
      admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      viewer: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    };
    return roleColors[roleName] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
</script>

<svelte:head>
  <title>Edit {user?.name || user?.email} - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header with navigation -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-4">
      <button
        type="button"
        onclick={() => goto(`/admin/users/${user.id}`)}
        class="flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <Icon icon="heroicons:arrow-left" class="w-5 h-5 mr-2" />
        Back to User
      </button>
      
      <div class="border-l border-gray-300 dark:border-gray-600 pl-4">
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Edit User: {user?.name || user?.email}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Last updated {formatDate(user?.updated_at)}
        </p>
      </div>
    </div>
    
    <div class="flex items-center space-x-2">
      {#each [getUserStatusBadge(user)] as statusBadge}
        <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {statusBadge.class}">
          {statusBadge.text}
        </span>
      {/each}
    </div>
  </div>

  <!-- User profile form -->
  <form 
    method="POST" 
    action="?/updateProfile"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
  >
    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
        User Profile
      </h2>
    </div>
    
    <div class="w-full max-w-none space-y-6 p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Name -->
        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Full Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            bind:value={name}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter full name"
          />
        </div>

        <!-- Email -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            bind:value={email}
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter email address"
          />
        </div>

        <!-- Username -->
        <div>
          <label for="preferred_username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Username
          </label>
          <input
            type="text"
            id="preferred_username"
            name="preferred_username"
            bind:value={preferredUsername}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter username"
          />
        </div>

        <!-- Status -->
        <div>
          <label for="is_active" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Account Status
          </label>
          <div class="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              bind:checked={isActive}
              disabled={!adminProtection.canModifyUser}
              class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label for="is_active" class="ml-2 text-sm text-gray-900 dark:text-white">
              Active Account
            </label>
            {#if !adminProtection.canModifyUser}
              <Icon icon="heroicons:lock-closed" class="w-4 h-4 ml-2 text-gray-400" />
            {/if}
          </div>
          {#if adminProtection.isCurrentUser}
            <p class="mt-1 text-sm text-orange-600 dark:text-orange-400">
              ⚠️ Cannot modify your own account status
            </p>
          {:else if adminProtection.isLastActiveAdmin}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              ⚠️ Cannot deactivate the last active admin
            </p>
          {:else}
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Inactive accounts cannot log in
            </p>
          {/if}
        </div>
      </div>

      <!-- Form Actions -->
      <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
        <button
          type="button"
          onclick={() => goto(`/admin/users/${user.id}`)}
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        
        <button
          type="submit"
          disabled={loading || !adminProtection.canModifyUser}
          class="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {#if loading}
            <LoadingSpinner size="sm" />
            Saving...
          {:else}
            <Icon icon="heroicons:check" class="w-4 h-4 mr-2 inline" />
            Save Changes
          {/if}
        </button>
        {#if !adminProtection.canModifyUser}
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {#if adminProtection.isCurrentUser}
              Cannot modify your own account
            {:else if adminProtection.isLastActiveAdmin}
              Cannot modify the last active admin
            {/if}
          </p>
        {/if}
      </div>
    </div>
  </form>

  <!-- Password management (for basic auth users only) -->
  {#if user && user.password_hash}
    <form 
      method="POST" 
      action="?/updatePassword"
      use:enhance={() => {
        loading = true;
        return async ({ update }) => {
          await update();
          loading = false;
        };
      }}
      class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Password Management
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Update the user's password (basic auth users only)
        </p>
      </div>
      
      <div class="w-full max-w-none space-y-6 p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- New Password -->
          <div>
            <label for="new_password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Password *
            </label>
            <input
              type="password"
              id="new_password"
              name="new_password"
              required
              minlength="8"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new password"
            />
            <p class="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirm_password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm Password *
            </label>
            <input
              type="password"
              id="confirm_password"
              name="confirm_password"
              required
              minlength="8"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Confirm new password"
            />
          </div>
        </div>

        <!-- Force password change option -->
        <div>
          <label class="flex items-center">
            <input
              type="checkbox"
              name="force_change"
              class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Force user to change password on next login</span>
          </label>
        </div>

        <!-- Form Actions -->
        <div class="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button
            type="submit"
            disabled={loading}
            class="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {#if loading}
              <LoadingSpinner size="sm" />
              Updating...
            {:else}
              <Icon icon="heroicons:key" class="w-4 h-4 mr-2 inline" />
              Update Password
            {/if}
          </button>
        </div>
      </div>
    </form>
  {/if}

  <!-- Role management -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
        Role Management
      </h2>
    </div>
    
    <div class="w-full max-w-none space-y-6 p-6">
      <!-- Current roles -->
      <div>
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Current Roles
        </h3>
        
        {#if user.roles && user.roles.length > 0}
          <div class="space-y-2">
            {#each user.roles as role}
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="flex items-center space-x-3">
                  <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {getRoleBadgeClass(role.name)}">
                    {role.display_name || role.name}
                  </span>
                </div>
                
                <form 
                  method="POST" 
                  action="?/removeRole"
                  use:enhance={() => {
                    roleLoading = true;
                    return async ({ update }) => {
                      await update();
                      roleLoading = false;
                    };
                  }}
                >
                  <input type="hidden" name="role_id" value={role.id} />
                  <button
                    type="submit"
                    disabled={roleLoading || (role.name === 'admin' && !adminProtection.canRemoveAdminRole)}
                    class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {#if roleLoading}
                      <LoadingSpinner size="sm" />
                    {:else if role.name === 'admin' && !adminProtection.canRemoveAdminRole}
                      <Icon icon="heroicons:lock-closed" class="w-4 h-4 inline mr-1" />
                      Protected
                    {:else}
                      Remove
                    {/if}
                  </button>
                </form>
                
                {#if role.name === 'admin' && !adminProtection.canRemoveAdminRole}
                  <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Cannot remove the last admin role
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-gray-500 dark:text-gray-400">
            No roles assigned
          </p>
        {/if}
      </div>
      
      <!-- Assign new role -->
      {#if unassignedRoles.length > 0}
        <div>
          <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Assign New Role
          </h3>
          
          <form 
            method="POST" 
            action="?/assignRole"
            use:enhance={() => {
              roleLoading = true;
              return async ({ update }) => {
                await update();
                roleLoading = false;
                selectedRoleId = '';
              };
            }}
            class="flex items-center space-x-3"
          >
            <select
              name="role_id"
              bind:value={selectedRoleId}
              required
              class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a role...</option>
              {#each unassignedRoles as role}
                <option value={role.id}>{role.display_name || role.name}</option>
              {/each}
            </select>
            
            <button
              type="submit"
              disabled={!selectedRoleId || roleLoading}
              class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {#if roleLoading}
                <LoadingSpinner size="sm" />
              {:else}
                Assign
              {/if}
            </button>
          </form>
        </div>
      {/if}
    </div>
  </div>

  <!-- Form Messages -->
  {#if form?.error}
    <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
      <div class="flex">
        <Icon icon="heroicons:x-circle" class="w-5 h-5 text-red-400 mr-2" />
        <p class="text-sm text-red-700 dark:text-red-200">
          {form.error}
        </p>
      </div>
    </div>
  {/if}

  {#if form?.success}
    <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4">
      <div class="flex">
        <Icon icon="heroicons:check-circle" class="w-5 h-5 text-green-400 mr-2" />
        <p class="text-sm text-green-700 dark:text-green-200">
          {form.message || 'User updated successfully!'}
        </p>
      </div>
    </div>
  {/if}
</div>