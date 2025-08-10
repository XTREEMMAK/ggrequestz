<!--
  Request page with multi-tab form system
-->

<script>
  import RequestForm from '../../components/RequestForm.svelte';
  
  let { data } = $props();
  
  let user = $derived(data?.user);
  let prefilledGame = $derived(data?.prefilledGame);
  
  function handleRequestSuccess({ detail }) {
    // Handle successful request submission
    
    // Could add analytics tracking here
    if (user) {
      // Track user action for analytics
    }
  }
</script>

<svelte:head>
  <title>Request Games - GameRequest</title>
  <meta name="description" content="Request new games, updates, or report issues. Help us improve our game library." />
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
      Submit a Request
    </h1>
    <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
      Help us improve our game library. Request new games, suggest updates, or report issues.
    </p>
  </div>
  
  <!-- Request Form -->
  <RequestForm 
    {user} 
    {prefilledGame}
    on:success={handleRequestSuccess}
  />
  
  <!-- Help Section -->
  <div class="mt-12 bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
      Need Help?
    </h2>
    
    <div class="grid md:grid-cols-3 gap-6">
      <div>
        <h3 class="font-medium text-gray-900 dark:text-white mb-2">
          🎮 Game Requests
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Request games that aren't in our library. Provide as much detail as possible to help us find the right version.
        </p>
      </div>
      
      <div>
        <h3 class="font-medium text-gray-900 dark:text-white mb-2">
          🔄 Update Requests
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Let us know when newer versions, patches, or DLC are available for existing games.
        </p>
      </div>
      
      <div>
        <h3 class="font-medium text-gray-900 dark:text-white mb-2">
          ⚠️ Issue Reports
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Report broken links, missing files, or other issues with existing games.
        </p>
      </div>
    </div>
    
    <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
      <p class="text-sm text-blue-800 dark:text-blue-200">
        <strong>Tip:</strong> Use the search function when requesting games to help us identify the exact title you're looking for. 
        This helps prevent duplicate requests and ensures we get the correct version.
      </p>
    </div>
  </div>
</div>