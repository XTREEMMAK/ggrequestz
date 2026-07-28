<!--
  Request page: submit a new request, or review the ones already submitted
-->

<script>
  import { page } from '$app/stores';
  import RequestForm from '../../components/RequestForm.svelte';
  import UserRequestsList from '../../components/UserRequestsList.svelte';
  import { requestSubmittedConfetti } from '$lib/confetti.js';
  import { rescindRequest } from '$lib/api.client.js';
  import { toasts } from '$lib/stores/toast.js';

  let { data } = $props();

  let user = $derived(data?.user);
  let prefilledGame = $derived(data?.prefilledGame);
  let userRequests = $state(data?.userRequests || []);
  let loading = $state(false);

  let activeTab = $state($page.url.searchParams.get('tab') === 'requests' ? 'requests' : 'submit');

  let tabs = $derived([
    { id: 'submit', label: 'Submit a Request', count: null },
    { id: 'requests', label: 'My Requests', count: userRequests.length }
  ]);

  // Confirmation modal state
  let showConfirmDialog = $state(false);
  let confirmAction = $state(null);
  let confirmMessage = $state('');
  let confirmTitle = $state('');

  function handleRequestSuccess() {
    requestSubmittedConfetti();
  }

  function initiateRescindRequest(request) {
    confirmTitle = 'Remove Game Request';
    confirmMessage = `Are you sure you want to remove your request for "${request.title}"? This action cannot be undone.`;
    confirmAction = () => handleRescindRequest(request);
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

  async function handleRescindRequest(request) {
    loading = true;
    try {
      const result = await rescindRequest(request.id);

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove request');
      }

      userRequests = userRequests.map((req) =>
        req.id === request.id
          ? { ...req, status: 'cancelled', updated_at: result.request.updated_at }
          : req
      );
      toasts.success(`Successfully removed request for "${request.title}"`);
    } catch (error) {
      toasts.error(error?.message || 'Failed to remove request. Please try again.');
    } finally {
      loading = false;
      confirmAction = null;
    }
  }
</script>

<svelte:head>
  <title>Requests - G.G Requestz</title>
  <meta name="description" content="Request new games, updates, or report issues, and track the requests you have already submitted." />
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
      Requests
    </h1>
    <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
      Help us improve our game library. Request new games, suggest updates, or report issues — and track what you've already asked for.
    </p>
  </div>

  <!-- Tabs -->
  <div class="border-b border-gray-200 dark:border-gray-700 mb-8">
    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
      {#each tabs as tab}
        <button
          type="button"
          onclick={() => (activeTab = tab.id)}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-t"
          class:border-blue-500={activeTab === tab.id}
          class:text-blue-600={activeTab === tab.id}
          class:dark:text-blue-400={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-gray-500={activeTab !== tab.id}
          class:hover:text-gray-700={activeTab !== tab.id}
          class:dark:text-gray-400={activeTab !== tab.id}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}{#if tab.count !== null}&nbsp;({tab.count}){/if}
        </button>
      {/each}
    </nav>
  </div>

  {#if activeTab === 'submit'}
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
  {:else}
    <UserRequestsList
      requests={userRequests}
      {loading}
      onRescind={initiateRescindRequest}
      onNewRequest={() => (activeTab = 'submit')}
    />
  {/if}
</div>

<!-- Rescind confirmation -->
{#if showConfirmDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 m-4 max-w-md w-full shadow-xl border border-red-200 dark:border-red-700">
      <div class="flex items-center mb-4">
        <div class="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center mr-3">
          <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <h3 id="confirm-title" class="text-lg font-semibold text-gray-900 dark:text-white">
          {confirmTitle}
        </h3>
      </div>

      <p class="text-gray-600 dark:text-gray-300 mb-6">
        {confirmMessage}
      </p>

      <div class="flex gap-3 justify-end">
        <button
          onclick={handleConfirmNo}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          onclick={handleConfirmYes}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}
