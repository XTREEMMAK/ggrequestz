<!--
  Admin request management interface
-->

<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';
  import StatusBadge from '../../../components/StatusBadge.svelte';
  import LoadingSpinner from '../../../components/LoadingSpinner.svelte';
  import { formatDate } from '$lib/utils.js';
  import { toasts } from '$lib/stores/toast.js';
  import Icon from '@iconify/svelte';

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  
  let { data } = $props();
  let requests = $state(data?.requests || []);
  let userPermissions = $derived(data?.userPermissions || []);
  let currentPage = $derived(data?.currentPage || 1);
  let totalPages = $derived(data?.totalPages || 1);
  let totalRequests = $derived(data?.totalRequests || 0);
  let sorting = $derived(data?.sorting || { sortBy: 'created_at', sortDir: 'desc' });
  
  let loading = $state(false);
  let selectedRequests = $state(new Set());
  let pageUrl = $derived($page.url);
  let currentFilter = $derived(pageUrl.searchParams.get('status') || 'all');
  let currentSearch = $derived(pageUrl.searchParams.get('search') || '');
  
  // Filter options
  let statusFilters = [
    { value: 'all', label: 'All Requests' },
    { value: 'pending', label: 'Pending', urgent: true },
    { value: 'approved', label: 'Approved' },
    { value: 'fulfilled', label: 'Fulfilled' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' }
  ];
  
  // Permission checks
  let canApprove = $derived(userPermissions.includes('request.approve'));
  let canEdit = $derived(userPermissions.includes('request.edit'));
  let canDelete = $derived(userPermissions.includes('request.delete'));
  
  // Track URL changes for filtering/sorting
  let previousUrl = $state('');
  
  $effect(() => {
    const currentUrl = pageUrl.toString();
    if (currentUrl !== previousUrl && previousUrl !== '') {
      // URL has changed, invalidate to reload data
      invalidateAll();
    }
    previousUrl = currentUrl;
  });
  
  // Update local state when data changes
  $effect(() => {
    requests = data?.requests || [];
  });
  
  function handleFilterChange(status) {
    const url = new URL(pageUrl);
    if (status === 'all') {
      url.searchParams.delete('status');
    } else {
      url.searchParams.set('status', status);
    }
    url.searchParams.delete('page'); // Reset to first page
    goto(url.toString());
  }
  
  let searchInput = $state(currentSearch);
  let allRequests = $state(data?.requests || []); // Store all requests from server

  // Sync searchInput with URL changes (for back/forward navigation)
  $effect(() => {
    searchInput = currentSearch;
  });

  // Update allRequests when data changes
  $effect(() => {
    allRequests = data?.requests || [];
  });

  // Filter requests based on search input (client-side filtering)
  let filteredRequests = $derived.by(() => {
    if (!searchInput || !searchInput.trim()) {
      return allRequests;
    }

    const query = searchInput.toLowerCase();
    return allRequests.filter(request => {
      const searchableFields = [
        request.title, // The game name is stored in 'title', not 'game_name'
        request.requester_username,
        request.status,
        request.notes,
        request.fulfilled_by_username
      ].filter(Boolean).map(field => field.toLowerCase());

      return searchableFields.some(field => field.includes(query));
    });
  });

  // Update requests to show filtered results
  $effect(() => {
    requests = filteredRequests;
  });

  function handleSearch(event) {
    searchInput = event.target.value;
    // No navigation needed - filtering happens client-side via reactive derived state
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
  
  function toggleRequestSelection(requestId) {
    if (selectedRequests.has(requestId)) {
      selectedRequests.delete(requestId);
    } else {
      selectedRequests.add(requestId);
    }
    selectedRequests = new Set(selectedRequests); // Trigger reactivity
  }
  
  function selectAllRequests() {
    if (selectedRequests.size === requests.length) {
      selectedRequests.clear();
    } else {
      selectedRequests = new Set(requests.map(r => r.id));
    }
  }
  
  async function updateRequestStatus(requestId, newStatus, adminNotes = '') {
    loading = true;
    try {
      const response = await fetch('/admin/api/requests/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          status: newStatus,
          admin_notes: adminNotes
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Update local state
        const requestIndex = requests.findIndex(r => r.id === requestId);
        if (requestIndex >= 0) {
          requests[requestIndex] = { ...requests[requestIndex], status: newStatus, admin_notes: adminNotes };
        }
        selectedRequests.delete(requestId);
        selectedRequests = new Set(selectedRequests);
      } else {
        throw new Error(result.error || 'Failed to update request');
      }
    } catch (error) {
      console.error('Update request error:', error);
      toasts.error('Failed to update request: ' + error.message);
    } finally {
      loading = false;
    }
  }
  
  async function bulkUpdateRequests(newStatus) {
    if (selectedRequests.size === 0) return;
    
    showConfirmation(
      `${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)} Requests`,
      `Are you sure you want to ${newStatus} ${selectedRequests.size} request(s)?`,
      () => performBulkUpdate(newStatus)
    );
  }

  async function performBulkUpdate(newStatus) {
    
    loading = true;
    try {
      const response = await fetch('/admin/api/requests/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_ids: Array.from(selectedRequests),
          status: newStatus
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Refresh the page to get updated data
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to update requests');
      }
    } catch (error) {
      console.error('Bulk update error:', error);
      toasts.error('Failed to update requests: ' + error.message);
    } finally {
      loading = false;
    }
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

  // Delete functionality
  let showDeleteConfirm = $state(false);
  let deleteRequestIds = $state([]);
  let deleteRequestTitles = $state([]);
  let deleteReason = $state('');

  function showDeleteModal(requestIds, requestTitles) {
    deleteRequestIds = requestIds;
    deleteRequestTitles = requestTitles;
    deleteReason = '';
    showDeleteConfirm = true;
  }

  function bulkDeleteRequests() {
    if (selectedRequests.size === 0) return;
    
    const idsToDelete = Array.from(selectedRequests);
    const titlesToDelete = requests
      .filter(req => selectedRequests.has(req.id))
      .map(req => req.title);
    
    showDeleteModal(idsToDelete, titlesToDelete);
  }

  async function confirmDelete() {
    loading = true;
    
    try {
      const response = await fetch('/admin/api/requests/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestIds: deleteRequestIds,
          reason: deleteReason
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Remove deleted requests from local state
        requests = requests.filter(req => !deleteRequestIds.includes(req.id));
        
        // Clear selection
        deleteRequestIds.forEach(id => selectedRequests.delete(id));
        selectedRequests = new Set(selectedRequests);
        
        // Show success message
        toasts.success(`Successfully deleted ${result.deleted_count} request${result.deleted_count > 1 ? 's' : ''}!`);

        showDeleteConfirm = false;
      } else {
        toasts.error(`Delete failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      toasts.error('Failed to delete requests. Please try again.');
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Request Management - Admin Panel</title>
</svelte:head>

<div class="w-full max-w-none space-y-6 p-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Request Management
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Manage and review user game requests
      </p>
    </div>
    
    <div class="flex items-center space-x-3">
      <span class="text-sm text-gray-500 dark:text-gray-400">
        {totalRequests} total requests
      </span>
    </div>
  </div>
  
  <!-- Filters and search -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <!-- Status filters -->
      <div class="flex flex-wrap gap-2">
        {#each statusFilters as filter}
          <button
            type="button"
            onclick={() => handleFilterChange(filter.value)}
            class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
            class:bg-blue-600={currentFilter === filter.value}
            class:text-white={currentFilter === filter.value}
            class:bg-gray-100={currentFilter !== filter.value}
            class:text-gray-700={currentFilter !== filter.value}
            class:dark:bg-gray-700={currentFilter !== filter.value}
            class:dark:text-gray-300={currentFilter !== filter.value}
            class:ring-2={filter.urgent && currentFilter === filter.value}
            class:ring-orange-500={filter.urgent && currentFilter === filter.value}
          >
            {filter.label}
          </button>
        {/each}
      </div>
      
      <!-- Search -->
      <div class="flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search requests..."
          value={searchInput}
          oninput={handleSearch}
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  </div>
  
  <!-- Bulk actions -->
  {#if selectedRequests.size > 0}
    <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
          {selectedRequests.size} request(s) selected
        </span>
        
        <div class="flex items-center space-x-2">
          {#if canApprove}
            <button
              type="button"
              onclick={() => bulkUpdateRequests('approved')}
              class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
            >
              Approve
            </button>
            <button
              type="button"
              onclick={() => bulkUpdateRequests('fulfilled')}
              class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded transition-colors"
            >
              Mark Fulfilled
            </button>
            <button
              type="button"
              onclick={() => bulkUpdateRequests('rejected')}
              class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
            >
              Reject
            </button>
          {/if}
          
          {#if canDelete}
            <button
              type="button"
              onclick={() => bulkDeleteRequests()}
              class="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded transition-colors"
              title="Delete selected requests"
            >
              Delete
            </button>
          {/if}
          
          <button
            type="button"
            onclick={() => { selectedRequests.clear(); selectedRequests = new Set(); }}
            class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Requests table -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    {#if loading}
      <div class="p-8 text-center">
        <LoadingSpinner size="lg" text="Loading requests..." />
      </div>
    {:else if requests.length > 0}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedRequests.size === requests.length && requests.length > 0}
                  onchange={selectAllRequests}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Cover
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('title')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Request</span>
                  <Icon 
                    icon={getSortIcon('title')} 
                    class="w-3 h-3 {sorting.sortBy === 'title' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('user_name')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>User</span>
                  <Icon 
                    icon={getSortIcon('user_name')} 
                    class="w-3 h-3 {sorting.sortBy === 'user_name' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('status')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Status</span>
                  <Icon 
                    icon={getSortIcon('status')} 
                    class="w-3 h-3 {sorting.sortBy === 'status' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('priority')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Priority</span>
                  <Icon 
                    icon={getSortIcon('priority')} 
                    class="w-3 h-3 {sorting.sortBy === 'priority' ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}"
                  />
                </button>
              </th>
              <th class="px-6 py-3 text-left">
                <button
                  type="button"
                  onclick={() => handleSort('created_at')}
                  class="group flex items-center space-x-1 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-100"
                >
                  <span>Date</span>
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
            {#each requests as request}
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedRequests.has(request.id)}
                    onchange={() => toggleRequestSelection(request.id)}
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                
                <td class="px-6 py-4">
                  <div class="w-16 h-20">
                    {#if request.cover_url}
                      <img
                        src={request.cover_url}
                        alt="{request.title} cover"
                        class="w-full h-full object-cover rounded-lg shadow-sm bg-gray-200 dark:bg-gray-700"
                        loading="lazy"
                        onerror={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                      <div class="w-full h-full hidden items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <Icon icon="heroicons:photo" class="w-6 h-6 text-gray-400" />
                      </div>
                    {:else}
                      <div class="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <Icon icon="heroicons:photo" class="w-6 h-6 text-gray-400" />
                      </div>
                    {/if}
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  <div class="flex items-start space-x-3">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {request.title}
                      </p>
                      <div class="flex items-center space-x-2 mt-1">
                        <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {getRequestTypeColor(request.request_type)}">
                          {request.request_type}
                        </span>
                        {#if request.platforms && request.platforms.length > 0}
                          <span class="text-xs text-gray-500 dark:text-gray-400">
                            {request.platforms.slice(0, 2).join(', ')}{request.platforms.length > 2 ? '...' : ''}
                          </span>
                        {/if}
                      </div>
                      {#if request.description}
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {request.description}
                        </p>
                      {/if}
                    </div>
                  </div>
                </td>
                
                <td class="px-6 py-4">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {request.user_name}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    ID: {String(request.user_id)}
                  </p>
                </td>
                
                <td class="px-6 py-4">
                  <StatusBadge status={request.status} />
                </td>
                
                <td class="px-6 py-4">
                  <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded {getPriorityColor(request.priority)}">
                    {request.priority}
                  </span>
                </td>
                
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(request.created_at)}
                  {#if request.updated_at !== request.created_at}
                    <br />
                    <span class="text-xs">Updated: {formatDate(request.updated_at)}</span>
                  {/if}
                </td>
                
                <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
                  {#if canApprove && request.status === 'pending'}
                    <button
                      type="button"
                      onclick={() => updateRequestStatus(request.id, 'approved')}
                      class="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onclick={() => updateRequestStatus(request.id, 'rejected')}
                      class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Reject
                    </button>
                  {:else if canApprove && request.status === 'approved'}
                    <button
                      type="button"
                      onclick={() => updateRequestStatus(request.id, 'fulfilled')}
                      class="text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                      Mark Fulfilled
                    </button>
                  {/if}
                  
                  {#if canEdit}
                    <button
                      type="button"
                      onclick={() => goto(`/admin/requests/${request.id}/edit`)}
                      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Edit
                    </button>
                  {/if}
                  
                  <button
                    type="button"
                    onclick={() => goto(`/admin/requests/${request.id}`)}
                    class="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    View
                  </button>
                  
                  {#if canDelete}
                    <button
                      type="button"
                      onclick={() => showDeleteModal([request.id], [request.title])}
                      class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      title="Delete request"
                    >
                      Delete
                    </button>
                  {/if}
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
        <Icon icon="heroicons:clipboard-document-list" class="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No requests found
        </h3>
        <p class="text-gray-500 dark:text-gray-400">
          {#if currentFilter !== 'all' || currentSearch}
            Try adjusting your filters or search query.
          {:else}
            No game requests have been submitted yet.
          {/if}
        </p>
      </div>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <div class="p-6">
        <div class="flex items-center mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Delete Request{deleteRequestIds.length > 1 ? 's' : ''}
            </h3>
          </div>
        </div>
        
        <div class="mb-4">
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Are you sure you want to delete {deleteRequestIds.length} request{deleteRequestIds.length > 1 ? 's' : ''}? This action cannot be undone.
          </p>
          
          <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 max-h-32 overflow-y-auto">
            {#each deleteRequestTitles as title}
              <p class="text-sm text-gray-800 dark:text-gray-200 truncate">• {title}</p>
            {/each}
          </div>
        </div>
        
        <div class="mb-4">
          <label for="deleteReason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reason for deletion (optional):
          </label>
          <textarea
            id="deleteReason"
            bind:value={deleteReason}
            rows="2"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Enter reason for deletion..."
          ></textarea>
        </div>
        
        <div class="flex items-center justify-end space-x-3">
          <button
            type="button"
            onclick={() => { showDeleteConfirm = false; }}
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={confirmDelete}
            disabled={loading}
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if loading}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deleting...
            {:else}
              Delete {deleteRequestIds.length} Request{deleteRequestIds.length > 1 ? 's' : ''}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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

