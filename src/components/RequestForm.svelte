<!--
  Multi-tab request form component for game requests, updates, and fixes
-->

<script>
  import { createEventDispatcher } from 'svelte';
  import SearchBar from './SearchBar.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { debounce } from '$lib/utils.js';
  import { igdbRequest, submitGameRequest } from '$lib/api.client.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from '@iconify/svelte';
  
  let { user = null, prefilledGame = null } = $props();
  
  const dispatch = createEventDispatcher();
  
  let activeTab = $state('game');
  let loading = $state(false);
  let submitError = $state('');
  let submitSuccess = $state(false);
  
  // Form data - using $state for reactivity
  let gameRequestForm = $state({
    title: prefilledGame?.title || '',
    igdb_id: prefilledGame?.igdb_id || '',
    platforms: prefilledGame?.platforms || [],
    priority: 'medium',
    description: ''
  });
  
  // Store selected game for background display
  let selectedGame = $state(prefilledGame || null);
  
  let updateRequestForm = $state({
    existing_game: '',
    update_type: 'content',
    new_information: '',
    description: ''
  });
  
  let fixRequestForm = $state({
    existing_game: '',
    issue_type: 'broken_link',
    affected_platform: '',
    description: ''
  });
  
  // Game suggestions for autocomplete
  let gameSuggestions = $state([]);
  let searchLoading = $state(false);
  
  const tabs = [
    { id: 'game', label: 'Request Game', icon: 'plus' },
    { id: 'update', label: 'Request Update', icon: 'refresh' },
    { id: 'fix', label: 'Report Issue', icon: 'exclamation' }
  ];
  
  const platforms = [
    'PC (Steam)', 'PC (Epic Games)', 'PC (GOG)', 'PC (Other)',
    'PlayStation 5', 'PlayStation 4', 'Xbox Series X/S', 'Xbox One',
    'Nintendo Switch', 'Mobile (iOS)', 'Mobile (Android)'
  ];
  
  const priorities = [
    { value: 'low', label: 'Low Priority', description: 'Nice to have' },
    { value: 'medium', label: 'Medium Priority', description: 'Would appreciate' },
    { value: 'high', label: 'High Priority', description: 'Really want this' }
  ];
  
  const updateTypes = [
    { value: 'content', label: 'Update Content', description: 'Add missing files, DLC, etc.' },
    { value: 'version', label: 'Update Version', description: 'Newer game version available' },
    { value: 'metadata', label: 'Fix Metadata', description: 'Incorrect game information' }
  ];
  
  const issueTypes = [
    { value: 'broken_link', label: 'Broken Download Link' },
    { value: 'missing_files', label: 'Missing Files' },
    { value: 'wrong_version', label: 'Wrong Game Version' },
    { value: 'not_working', label: 'Game Not Working' },
    { value: 'other', label: 'Other Issue' }
  ];
  
  function switchTab(tabId) {
    activeTab = tabId;
    submitError = '';
    submitSuccess = false;
    // Clear selected game background when switching away from game tab
    if (tabId !== 'game') {
      selectedGame = null;
    }
  }
  
  function handleGameSearch({ detail }) {
    searchLoading = true;
    debouncedGameSearch(detail.query);
  }
  
  const debouncedGameSearch = debounce(async (query) => {
    try {
      const data = await igdbRequest('search', { q: query, limit: 5 });
      
      if (data.success) {
        gameSuggestions = data.data.map(game => ({
          title: game.title,
          igdb_id: game.igdb_id,
          platforms: game.platforms,
          summary: game.summary,
          cover_url: game.cover_url
        }));
      }
    } catch (error) {
      console.error('Game search error:', error);
      gameSuggestions = [];
    } finally {
      searchLoading = false;
    }
  }, 300);
  
  function handleGameSelect({ detail }) {
    const game = detail.suggestion;
    gameRequestForm.title = game.title;
    gameRequestForm.igdb_id = game.igdb_id;
    gameRequestForm.platforms = game.platforms || [];
    selectedGame = game; // Store the full game data for background display
    gameSuggestions = [];
  }
  
  function togglePlatform(platform) {
    const index = gameRequestForm.platforms.indexOf(platform);
    if (index > -1) {
      gameRequestForm.platforms = gameRequestForm.platforms.filter(p => p !== platform);
    } else {
      gameRequestForm.platforms = [...gameRequestForm.platforms, platform];
    }
  }
  
  async function submitRequest() {
    if (!user) {
      submitError = 'You must be logged in to submit a request.';
      return;
    }
    
    loading = true;
    submitError = '';
    
    try {
      let requestData = {
        user_id: user.sub,
        user_name: user.name || user.preferred_username || user.email,
        request_type: activeTab
      };
      
      // Build request data based on active tab
      switch (activeTab) {
        case 'game':
          if (!gameRequestForm.title.trim()) {
            throw new Error('Game title is required');
          }
          requestData = {
            ...requestData,
            title: gameRequestForm.title.trim(),
            igdb_id: gameRequestForm.igdb_id,
            platforms: gameRequestForm.platforms,
            priority: gameRequestForm.priority,
            description: gameRequestForm.description.trim()
          };
          break;
          
        case 'update':
          if (!updateRequestForm.existing_game.trim()) {
            throw new Error('Please specify which game needs updating');
          }
          requestData = {
            ...requestData,
            title: `Update: ${updateRequestForm.existing_game.trim()}`,
            existing_game: updateRequestForm.existing_game.trim(),
            update_type: updateRequestForm.update_type,
            new_information: updateRequestForm.new_information.trim(),
            description: updateRequestForm.description.trim()
          };
          break;
          
        case 'fix':
          if (!fixRequestForm.existing_game.trim()) {
            throw new Error('Please specify which game has issues');
          }
          requestData = {
            ...requestData,
            title: `Fix: ${fixRequestForm.existing_game.trim()}`,
            existing_game: fixRequestForm.existing_game.trim(),
            issue_type: fixRequestForm.issue_type,
            affected_platform: fixRequestForm.affected_platform,
            description: fixRequestForm.description.trim()
          };
          break;
      }
      
      // Submit request
      const result = await submitGameRequest(requestData);
      
      if (result.success) {
        submitSuccess = true;
        resetForm();
        dispatch('success', { request: result.request });
      } else {
        throw new Error(result.error || 'Failed to submit request');
      }
      
    } catch (error) {
      console.error('Submit error:', error);
      submitError = error.message;
    } finally {
      loading = false;
    }
  }
  
  function resetForm() {
    gameRequestForm = {
      title: '',
      igdb_id: '',
      platforms: [],
      priority: 'medium',
      description: ''
    };
    
    updateRequestForm = {
      existing_game: '',
      update_type: 'content',
      new_information: '',
      description: ''
    };
    
    fixRequestForm = {
      existing_game: '',
      issue_type: 'broken_link',
      affected_platform: '',
      description: ''
    };
    
    gameSuggestions = [];
    selectedGame = null; // Clear selected game background
  }
  
  function clearGameSuggestions() {
    gameSuggestions = [];
  }
</script>

<div class="max-w-4xl mx-auto">
    <!-- Tab Navigation -->
  <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
    <nav class="-mb-px flex space-x-2 sm:space-x-8 overflow-x-auto scrollbar-hide">
      {#each tabs as tab}
        <button
          type="button"
          onclick={() => switchTab(tab.id)}
          class="whitespace-nowrap py-2 px-2 sm:px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0"
          class:border-blue-500={activeTab === tab.id}
          class:text-blue-600={activeTab === tab.id}
          class:dark:text-blue-400={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-gray-500={activeTab !== tab.id}
          class:hover:text-gray-700={activeTab !== tab.id}
          class:dark:text-gray-400={activeTab !== tab.id}
          class:dark:hover:text-gray-300={activeTab !== tab.id}
        >
          <!-- Tab Icons -->
          {#if tab.icon === 'plus'}
            <Icon icon="heroicons:plus" class="w-4 h-4 inline mr-2" />
          {:else if tab.icon === 'refresh'}
            <Icon icon="heroicons:arrow-path" class="w-4 h-4 inline mr-2" />
          {:else if tab.icon === 'exclamation'}
            <Icon icon="heroicons:exclamation-triangle" class="w-4 h-4 inline mr-2" />
          {/if}
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>
  
  <!-- Success Message -->
  {#if submitSuccess}
    <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-6">
      <div class="flex">
        <Icon icon="heroicons:check-circle-solid" class="w-5 h-5 text-green-400 mt-0.5 mr-3" />
        <div>
          <h3 class="text-sm font-medium text-green-800 dark:text-green-200">
            Request submitted successfully!
          </h3>
          <p class="text-sm text-green-700 dark:text-green-300 mt-1">
            Your request has been received and will be reviewed by our team.
          </p>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Error Message -->
  {#if submitError}
    <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
      <div class="flex">
        <Icon icon="heroicons:x-circle-solid" class="w-5 h-5 text-red-400 mt-0.5 mr-3" />
        <div>
          <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
            Error submitting request
          </h3>
          <p class="text-sm text-red-700 dark:text-red-300 mt-1">
            {submitError}
          </p>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Form Content -->
  <form onsubmit={(e) => { e.preventDefault(); submitRequest(); }} class="space-y-6">
    <!-- Game Request Tab -->
    {#if activeTab === 'game'}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {#if selectedGame?.cover_url}
          <!-- Cover art in separate window -->
          <div class="lg:col-span-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Selected Game</h4>
              <div class="aspect-[3/4] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                <img
                  src={selectedGame.cover_url}
                  alt="{selectedGame.title} cover"
                  class="w-full h-full object-cover"
                />
              </div>
              {#if selectedGame.title}
                <h5 class="text-sm font-semibold text-gray-900 dark:text-white mt-3 line-clamp-2">
                  {selectedGame.title}
                </h5>
              {/if}
              {#if selectedGame.summary}
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-3">
                  {selectedGame.summary}
                </p>
              {/if}
            </div>
          </div>
        {/if}
        
        <!-- Form content -->
        <div class="{selectedGame?.cover_url ? 'lg:col-span-8' : 'lg:col-span-12'}">
          <div 
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
            in:fade={{ duration: 200, easing: cubicOut }}
            out:fade={{ duration: 150, easing: cubicOut }}
          >
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Request a New Game
        </h3>
        
        <!-- Game Title with Search -->
        <div class="mb-6">
          <label for="game-title" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Game Title *
          </label>
          <SearchBar
            bind:value={gameRequestForm.title}
            suggestions={gameSuggestions}
            loading={searchLoading}
            placeholder="Start typing to search for games..."
            on:search={handleGameSearch}
            on:select={handleGameSelect}
            on:clear-suggestions={clearGameSuggestions}
          />
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Search will help you find the exact game from our database
          </p>
        </div>
        
        <!-- Platform Selection -->
        <fieldset class="mb-6">
          <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preferred Platforms
          </legend>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            {#each platforms as platform}
              <label class="flex items-center space-x-2 p-2 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={gameRequestForm.platforms.includes(platform)}
                  onchange={() => togglePlatform(platform)}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">{platform}</span>
              </label>
            {/each}
          </div>
        </fieldset>
        
        <!-- Priority -->
        <fieldset class="mb-6">
          <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Priority Level
          </legend>
          <div class="space-y-2">
            {#each priorities as priority}
              <label class="flex items-start space-x-3 p-3 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                <input
                  type="radio"
                  bind:group={gameRequestForm.priority}
                  value={priority.value}
                  class="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div class="text-sm font-medium text-gray-900 dark:text-white">
                    {priority.label}
                  </div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    {priority.description}
                  </div>
                </div>
              </label>
            {/each}
          </div>
        </fieldset>
        
        
        <!-- Additional Details -->
        <div class="mb-6">
          <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Additional Details
          </label>
          <textarea
            id="description"
            bind:value={gameRequestForm.description}
            rows="4"
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Any additional information about the game, specific edition, DLC requirements, etc."
          ></textarea>
        </div>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Update Request Tab -->
    {#if activeTab === 'update'}
      <div 
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
        in:fade={{ duration: 200, easing: cubicOut }}
        out:fade={{ duration: 150, easing: cubicOut }}
      >
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Request Game Update
        </h3>
        
        <!-- Existing Game -->
        <div class="mb-6">
          <label for="existing-game" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Which game needs updating? *
          </label>
          <input
            id="existing-game"
            type="text"
            bind:value={updateRequestForm.existing_game}
            required
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter the exact game title..."
          />
        </div>
        
        <!-- Update Type -->
        <fieldset class="mb-6">
          <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What type of update is needed?
          </legend>
          <div class="space-y-2">
            {#each updateTypes as type}
              <label class="flex items-start space-x-3 p-3 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                <input
                  type="radio"
                  bind:group={updateRequestForm.update_type}
                  value={type.value}
                  class="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div class="text-sm font-medium text-gray-900 dark:text-white">
                    {type.label}
                  </div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    {type.description}
                  </div>
                </div>
              </label>
            {/each}
          </div>
        </fieldset>
        
        <!-- New Information -->
        <div class="mb-6">
          <label for="new-info" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What new information or version is available?
          </label>
          <textarea
            id="new-info"
            bind:value={updateRequestForm.new_information}
            rows="3"
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Describe what needs to be updated (version number, new DLC, patches, etc.)..."
          ></textarea>
        </div>
        
        <!-- Description -->
        <div class="mb-6">
          <label for="update-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Additional Details
          </label>
          <textarea
            id="update-description"
            bind:value={updateRequestForm.description}
            rows="4"
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Provide any additional context about why this update is needed..."
          ></textarea>
        </div>
      </div>
    {/if}
    
    <!-- Fix Request Tab -->
    {#if activeTab === 'fix'}
      <div 
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
        in:fade={{ duration: 200, easing: cubicOut }}
        out:fade={{ duration: 150, easing: cubicOut }}
      >
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Report an Issue
        </h3>
        
        <!-- Existing Game -->
        <div class="mb-6">
          <label for="fix-game" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Which game has issues? *
          </label>
          <input
            id="fix-game"
            type="text"
            bind:value={fixRequestForm.existing_game}
            required
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter the exact game title..."
          />
        </div>
        
        <!-- Issue Type -->
        <div class="mb-6">
          <label for="issue-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What type of issue are you reporting?
          </label>
          <select
            id="issue-type"
            bind:value={fixRequestForm.issue_type}
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          >
            {#each issueTypes as issue}
              <option value={issue.value}>{issue.label}</option>
            {/each}
          </select>
        </div>
        
        <!-- Affected Platform -->
        <div class="mb-6">
          <label for="affected-platform" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Which platform/version is affected?
          </label>
          <select
            id="affected-platform"
            bind:value={fixRequestForm.affected_platform}
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select platform (optional)</option>
            {#each platforms as platform}
              <option value={platform}>{platform}</option>
            {/each}
          </select>
        </div>
        
        <!-- Description -->
        <div class="mb-6">
          <label for="fix-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Describe the issue in detail *
          </label>
          <textarea
            id="fix-description"
            bind:value={fixRequestForm.description}
            rows="5"
            required
            class="block w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            placeholder="Please provide as much detail as possible about the issue you encountered..."
          ></textarea>
        </div>
      </div>
    {/if}
    
    <!-- Submit Button -->
    <div class="flex justify-end">
      <button
        type="submit"
        disabled={loading || !user}
        class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {#if loading}
          <LoadingSpinner size="sm" color="white" />
          <span class="ml-2">Submitting...</span>
        {:else}
          Submit Request
        {/if}
      </button>
    </div>
  </form>
  
  <!-- Login Prompt -->
  {#if !user}
    <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mt-6">
      <div class="flex">
        <Icon icon="heroicons:information-circle-solid" class="w-5 h-5 text-blue-400 mt-0.5 mr-3" />
        <div>
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
            Login Required
          </h3>
          <p class="text-sm text-blue-700 dark:text-blue-300 mt-1">
            You need to be logged in to submit requests. 
            <a href="/api/auth/login" class="font-medium underline">Click here to login</a>
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  .scrollbar-hide {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
</style>