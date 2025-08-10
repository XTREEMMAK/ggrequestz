<script>
  import Icon from '@iconify/svelte';
  
  let { data } = $props();
  
  let navItems = $state(data.navItems || []);
  let availableRoles = $state(data.availableRoles || []);
  let showAddForm = $state(false);
  let editingItem = $state(null);
  let loading = $state(false);
  
  // Form data
  let formData = $state({
    name: '',
    href: '',
    icon: 'heroicons:link',
    position: 100,
    is_external: false,
    is_active: true,
    visible_to_all: true,
    visible_to_guests: true,
    minimum_role: 'viewer' // New hierarchical system
  });
  
  // Role hierarchy (highest to lowest)
  const roleHierarchy = [
    { value: 'admin', label: 'Admin', description: 'Highest level - full access' },
    { value: 'manager', label: 'Manager', description: 'Management level access' },
    { value: 'moderator', label: 'Moderator', description: 'Content moderation access' },
    { value: 'user', label: 'User', description: 'Standard user access' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
  ];
  
  // Function to get all roles at or below a given role level
  function getRolesAtOrBelow(minimumRole) {
    const minimumIndex = roleHierarchy.findIndex(role => role.value === minimumRole);
    if (minimumIndex === -1) return [];
    return roleHierarchy.slice(minimumIndex).map(role => role.value);
  }
  
  // Common Heroicons for selection
  const commonIcons = [
    { value: 'heroicons:link', label: 'Link' },
    { value: 'heroicons:home', label: 'Home' },
    { value: 'heroicons:book-open', label: 'Book' },
    { value: 'heroicons:question-mark-circle', label: 'Help' },
    { value: 'heroicons:cog-6-tooth', label: 'Settings' },
    { value: 'heroicons:document-text', label: 'Document' },
    { value: 'heroicons:globe-alt', label: 'Globe' },
    { value: 'heroicons:information-circle', label: 'Info' },
    { value: 'heroicons:star', label: 'Star' },
    { value: 'heroicons:heart', label: 'Heart' },
    { value: 'heroicons:fire', label: 'Fire' },
    { value: 'heroicons:bolt', label: 'Bolt' },
    { value: 'heroicons:shield-check', label: 'Shield' },
    { value: 'heroicons:chart-bar', label: 'Chart' },
    { value: 'heroicons:chat-bubble-left', label: 'Chat' },
    { value: 'heroicons:flag', label: 'Pirate Flag' }
  ];
  
  function resetForm() {
    formData = {
      name: '',
      href: '',
      icon: 'heroicons:link',
      position: 100,
      is_external: false,
      is_active: true,
      visible_to_all: true,
      visible_to_guests: true,
      minimum_role: 'viewer'
    };
    editingItem = null;
    showAddForm = false;
  }
  
  function startEdit(item) {
    // Convert from old system to new hierarchical system if needed
    let minimumRole = 'viewer'; // default
    if (item.minimum_role) {
      minimumRole = item.minimum_role;
    } else if (item.allowed_roles && Array.isArray(item.allowed_roles) && item.allowed_roles.length > 0) {
      // Legacy conversion: find the highest role in the allowed_roles array
      for (let role of roleHierarchy) {
        if (item.allowed_roles.includes(role.value)) {
          minimumRole = role.value;
          break;
        }
      }
    }
    
    formData = {
      name: item.name,
      href: item.href,
      icon: item.icon,
      position: item.position,
      is_external: item.is_external,
      is_active: item.is_active,
      visible_to_all: item.visible_to_all !== false, // Default to true if not set
      visible_to_guests: item.visible_to_guests !== false, // Default to true if not set
      minimum_role: minimumRole
    };
    editingItem = item.id;
    showAddForm = true;
  }
  
  async function saveNavItem() {
    if (!formData.name.trim() || !formData.href.trim()) {
      alert('Name and URL are required');
      return;
    }
    
    loading = true;
    
    try {
      const response = await fetch('/admin/api/navigation', {
        method: editingItem ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: editingItem,
          ...formData
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh the navigation items
        const refreshResponse = await fetch('/admin/api/navigation');
        const refreshResult = await refreshResponse.json();
        if (refreshResult.success) {
          navItems = refreshResult.data;
        }
        
        resetForm();
      } else {
        alert(result.error || 'Failed to save navigation item');
      }
    } catch (error) {
      console.error('Error saving navigation item:', error);
      alert('Failed to save navigation item');
    } finally {
      loading = false;
    }
  }
  
  async function deleteNavItem(id) {
    if (!confirm('Are you sure you want to delete this navigation item?')) {
      return;
    }
    
    loading = true;
    
    try {
      const response = await fetch('/admin/api/navigation', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });
      
      const result = await response.json();
      
      if (result.success) {
        navItems = navItems.filter(item => item.id !== id);
      } else {
        alert(result.error || 'Failed to delete navigation item');
      }
    } catch (error) {
      console.error('Error deleting navigation item:', error);
      alert('Failed to delete navigation item');
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Custom Navigation - Admin Panel</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-6">
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Custom Navigation</h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Manage custom navigation links that appear in the sidebar
      </p>
    </div>
    <button
      onclick={() => { showAddForm = true; }}
      class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      disabled={loading}
    >
      <Icon icon="heroicons:plus" class="w-4 h-4 inline mr-2" />
      Add Navigation Item
    </button>
  </div>

  <!-- Add/Edit Form -->
  {#if showAddForm}
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {editingItem ? 'Edit' : 'Add'} Navigation Item
      </h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="nav-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Name *
          </label>
          <input
            id="nav-name"
            type="text"
            bind:value={formData.name}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Documentation"
          />
        </div>
        
        <div>
          <label for="nav-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            URL *
          </label>
          <input
            id="nav-url"
            type="url"
            bind:value={formData.href}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., https://docs.example.com"
          />
        </div>
        
        <div>
          <label for="nav-icon" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Icon
          </label>
          <select
            id="nav-icon"
            bind:value={formData.icon}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {#each commonIcons as iconOption}
              <option value={iconOption.value}>{iconOption.label}</option>
            {/each}
          </select>
          <div class="mt-2 flex items-center space-x-2 text-sm text-gray-500">
            <Icon icon={formData.icon} class="w-4 h-4" />
            <span>Preview: {formData.icon}</span>
          </div>
        </div>
        
        <div>
          <label for="nav-position" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Position (Order)
          </label>
          <input
            id="nav-position"
            type="number"
            bind:value={formData.position}
            min="0"
            max="999"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
        </div>
        
        <div class="flex items-center space-x-4">
          <label class="flex items-center">
            <input
              type="checkbox"
              bind:checked={formData.is_external}
              class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">External Link</span>
          </label>
          
          <label class="flex items-center">
            <input
              type="checkbox"
              bind:checked={formData.is_active}
              class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>
      </div>
      
      <!-- Role-based Visibility Settings -->
      <div class="mt-6">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">Visibility Settings</h3>
        
        <div class="space-y-4">
          <div class="flex items-center space-x-4">
            <label class="flex items-center">
              <input
                type="checkbox"
                bind:checked={formData.visible_to_all}
                class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Visible to All Users</span>
            </label>
            
            <label class="flex items-center">
              <input
                type="checkbox"
                bind:checked={formData.visible_to_guests}
                class="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Visible to Guests</span>
            </label>
          </div>
          
          <!-- Hierarchical Role Selection -->
          {#if !formData.visible_to_all}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Minimum Role Level
              </label>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Select the minimum role required. All higher roles will automatically have access.
              </p>
              <div class="space-y-2">
                {#each roleHierarchy as role}
                  <label class="flex items-center p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <input
                      type="radio"
                      value={role.value}
                      bind:group={formData.minimum_role}
                      class="text-blue-600 border-gray-300 focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <div class="ml-2 flex-1">
                      <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {role.label}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {role.description}
                      </div>
                      {#if formData.minimum_role === role.value}
                        <div class="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Includes: {getRolesAtOrBelow(role.value).join(', ')}
                        </div>
                      {/if}
                    </div>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Visibility Explanation -->
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div class="flex">
              <Icon icon="heroicons:information-circle" class="w-5 h-5 text-blue-400 mr-2 mt-0.5" />
              <div class="text-sm text-blue-700 dark:text-blue-300">
                <p class="font-medium">Hierarchical Visibility Rules:</p>
                <ul class="mt-1 list-disc list-inside space-y-1">
                  <li>If "Visible to All Users" is checked, all authenticated users can see this link</li>
                  <li>If "Visible to Guests" is checked, unauthenticated users can also see this link</li>
                  <li>When "Visible to All Users" is unchecked, select the minimum role level required</li>
                  <li><strong>Higher roles automatically include lower roles:</strong> Admin > Manager > Moderator > User > Viewer</li>
                  <li>Example: Selecting "User" allows User, Moderator, Manager, and Admin roles to see the link</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex justify-end space-x-3 mt-6">
        <button
          onclick={resetForm}
          class="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          onclick={saveNavItem}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        >
          {#if loading}
            <Icon icon="heroicons:arrow-path" class="w-4 h-4 inline mr-2 animate-spin" />
          {/if}
          {editingItem ? 'Update' : 'Add'} Item
        </button>
      </div>
    </div>
  {/if}

  <!-- Navigation Items Table -->
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Item
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              URL
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Position
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {#each navItems as item}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <Icon icon={item.icon} class="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">
                      {item.is_external ? 'External' : 'Internal'} • Created by {item.created_by_name || 'System'}
                      {#if item.visible_to_all === false}
                        • Role-based visibility
                      {:else if item.visible_to_guests === false}
                        • Users only
                      {:else}
                        • Public
                      {/if}
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900 dark:text-white">
                  <a href={item.href} target="_blank" rel="noopener noreferrer" class="hover:text-blue-600">
                    {item.href}
                    {#if item.is_external}
                      <Icon icon="heroicons:arrow-top-right-on-square" class="w-3 h-3 inline ml-1" />
                    {/if}
                  </a>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {item.position}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded-full {item.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}">
                  {item.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <div class="flex space-x-2">
                  <button
                    onclick={() => startEdit(item)}
                    class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    disabled={loading}
                  >
                    <Icon icon="heroicons:pencil" class="w-4 h-4" />
                  </button>
                  <button
                    onclick={() => deleteNavItem(item.id)}
                    class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    disabled={loading}
                  >
                    <Icon icon="heroicons:trash" class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      
      {#if navItems.length === 0}
        <div class="text-center py-12">
          <Icon icon="heroicons:link" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No custom navigation items</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-4">
            Get started by adding your first custom navigation link.
          </p>
          <button
            onclick={() => { showAddForm = true; }}
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Add Navigation Item
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>