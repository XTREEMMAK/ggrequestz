<!--
  Admin request edit form
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import StatusBadge from '../../../../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../../../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import Icon from '@iconify/svelte';
  
  let { data, form } = $props();
  let request = $derived(data?.request);
  let userPermissions = $derived(data?.userPermissions || []);
  
  let loading = $state(false);
  let formElement = $state();
  
  // Form fields
  let title = $state('');
  let description = $state('');
  let reason = $state('');
  let priority = $state('medium');
  let status = $state('pending');
  let adminNotes = $state('');
  let platforms = $state('');
  
  // Initialize form fields when request data is available
  $effect(() => {
    if (request) {
      title = request.title || '';
      description = request.description || '';
      reason = request.reason || '';
      priority = request.priority || 'medium';
      status = request.status || 'pending';
      adminNotes = request.admin_notes || '';
      platforms = (request.platforms || []).join(', ');
    }
  });
  
  // Permission checks
  let canApprove = $derived(userPermissions.includes('request.approve'));
  let canEdit = $derived(userPermissions.includes('request.edit'));
  
  // Status options based on permissions
  let statusOptions = $derived([
    { value: 'pending', label: 'Pending', available: true },
    { value: 'approved', label: 'Approved', available: canApprove },
    { value: 'rejected', label: 'Rejected', available: canApprove },
    { value: 'fulfilled', label: 'Fulfilled', available: canApprove },
    { value: 'cancelled', label: 'Cancelled', available: canEdit }
  ].filter(option => option.available));
  
  let priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' }
  ];
  
  $effect(() => {
    if (form?.success) {
      goto('/admin/requests');
    }
  });
  
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
  <title>Edit Request #{request?.id} - Admin Panel</title>
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
      
      <div class="border-l border-gray-300 dark:border-gray-600 pl-4">
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
          Edit Request #{request?.id}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Last updated {formatDate(request?.updated_at)}
        </p>
      </div>
    </div>
    
    <div class="flex items-center space-x-2">
      <span class="inline-flex px-2 py-0.5 text-sm font-medium rounded {getRequestTypeColor(request?.request_type)}">
        {request?.request_type}
      </span>
    </div>
  </div>

  <!-- Form -->
  <form 
    bind:this={formElement}
    method="POST" 
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
    class="space-y-6"
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Request Information
        </h2>
      </div>
      
      <div class="w-full max-w-none space-y-6 p-6">
        <!-- Status and Priority Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label for="status" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              id="status"
              name="status"
              bind:value={status}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {#each statusOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          
          <div>
            <label for="priority" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              bind:value={priority}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {#each priorityOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Title -->
        <div>
          <label for="title" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            bind:value={title}
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter request title"
          />
        </div>

        <!-- Description -->
        <div>
          <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            bind:value={description}
            rows="4"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter request description"
          ></textarea>
        </div>

        <!-- Reason -->
        <div>
          <label for="reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reason
          </label>
          <textarea
            id="reason"
            name="reason"
            bind:value={reason}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter reason for the request"
          ></textarea>
        </div>

        <!-- Platforms -->
        <div>
          <label for="platforms" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Platforms
          </label>
          <input
            type="text"
            id="platforms"
            name="platforms"
            bind:value={platforms}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter platforms separated by commas (e.g., PC, Xbox, PlayStation)"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Separate multiple platforms with commas
          </p>
        </div>

        <!-- Admin Notes -->
        <div>
          <label for="admin_notes" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Admin Notes
          </label>
          <textarea
            id="admin_notes"
            name="admin_notes"
            bind:value={adminNotes}
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Add admin notes (internal use only)"
          ></textarea>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            These notes are for internal admin use only
          </p>
        </div>
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
            {form.message || 'Request updated successfully!'}
          </p>
        </div>
      </div>
    {/if}

    <!-- Form Actions -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        onclick={() => goto('/admin/requests')}
        class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        Cancel
      </button>
      
      <button
        type="submit"
        disabled={loading}
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
    </div>
  </form>
</div>