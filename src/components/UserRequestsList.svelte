<!--
  List of a user's submitted game requests, with cover art and rescind actions.
  Shared by the profile page and the request page.
-->

<script>
  import { goto } from '$app/navigation';
  import StatusBadge from './StatusBadge.svelte';
  import { formatDate } from '$lib/utils.js';
  import { igdbRequest } from '$lib/api.client.js';

  let {
    requests = [],
    loading = false,
    onRescind,
    onNewRequest = () => goto('/request')
  } = $props();

  let requestCoverUrls = $state(new Map());

  // Plain Set, deliberately not $state: the effect below writes it, and a
  // reactive read would re-trigger the effect. Tracking attempts rather than
  // successes is what stops a request whose cover cannot be resolved from being
  // retried forever.
  const attempted = new Set();

  $effect(() => {
    const needingCovers = requests.filter(
      (request) => request.igdb_id && !attempted.has(request.id)
    );
    if (needingCovers.length === 0) return;

    needingCovers.forEach((request) => attempted.add(request.id));
    fetchRequestCoverUrls(needingCovers);
  });

  async function fetchRequestCoverUrls(needingCovers) {
    for (const request of needingCovers) {
      try {
        const result = await igdbRequest('game', { id: request.igdb_id });
        if (result.success && result.data.length > 0 && result.data[0].cover_url) {
          requestCoverUrls.set(request.id, result.data[0].cover_url);
        }
      } catch (error) {
        // A missing cover is cosmetic; the request still renders without it.
      }
    }
    requestCoverUrls = new Map(requestCoverUrls);
  }
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
      My Requests ({requests.length})
    </h2>
    <button
      type="button"
      onclick={onNewRequest}
      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors bg-transparent hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
    >
      Make new request →
    </button>
  </div>

  {#if requests.length > 0}
    <div class="space-y-4">
      {#each requests as request}
        <div class="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 overflow-hidden">
          {#if requestCoverUrls.has(request.id)}
            <!-- Background cover art positioned on the right -->
            <div class="absolute inset-0 z-0 flex justify-end">
              <div class="w-1/3 h-full relative">
                <img
                  src={requestCoverUrls.get(request.id)}
                  alt="{request.title} cover"
                  class="w-full h-full object-cover"
                />
                <!-- Gradient overlay from right (cover) to left (original background) -->
                <div class="absolute inset-0 bg-gradient-to-l from-transparent to-white dark:to-gray-800"></div>
              </div>
            </div>
          {/if}
          <!-- Content overlay -->
          <div class="relative z-10 flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3 mb-2">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white">
                  {request.title}
                </h3>
                <StatusBadge status={request.status} />
                <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {request.request_type}
                </span>
              </div>

              <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Submitted {formatDate(request.created_at)}
                {#if request.updated_at !== request.created_at}
                  • Updated {formatDate(request.updated_at)}
                {/if}
              </div>

              {#if request.platforms && request.platforms.length > 0}
                <div class="mb-3">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Platforms: </span>
                  {#each request.platforms as platform}
                    <span class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded mr-1">
                      {platform}
                    </span>
                  {/each}
                </div>
              {/if}

              {#if request.reason}
                <div class="mb-3">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Reason: </span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">{request.reason}</span>
                </div>
              {/if}

              {#if request.description}
                <div class="mb-3">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Description: </span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">{request.description}</span>
                </div>
              {/if}

              {#if request.admin_notes}
                <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded p-3 mt-3">
                  <span class="text-sm font-medium text-blue-800 dark:text-blue-200">Admin Notes: </span>
                  <span class="text-sm text-blue-700 dark:text-blue-300">{request.admin_notes}</span>
                </div>
              {/if}
            </div>

            <!-- Actions and Priority Badge -->
            <div class="ml-4 flex flex-col items-end gap-2">
              <!-- Rescind Button -->
              {#if ['pending', 'approved'].includes(request.status)}
                <button
                  onclick={() => onRescind?.(request)}
                  class="text-xs px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 rounded-md transition-colors font-medium"
                  disabled={loading}
                >
                  Remove Request
                </button>
              {/if}

              <!-- Priority Badge -->
              {#if request.priority && request.priority !== 'medium'}
                <span class="text-xs font-medium px-2 py-1 rounded-full"
                      class:bg-red-100={request.priority === 'high'}
                      class:text-red-800={request.priority === 'high'}
                      class:dark:bg-red-900={request.priority === 'high'}
                      class:dark:text-red-200={request.priority === 'high'}
                      class:bg-gray-100={request.priority === 'low'}
                      class:text-gray-800={request.priority === 'low'}
                      class:dark:bg-gray-700={request.priority === 'low'}
                      class:dark:text-gray-300={request.priority === 'low'}
                >
                  {request.priority} priority
                </span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        No requests yet
      </h3>
      <p class="text-gray-500 dark:text-gray-400 mb-4">
        You haven't submitted any game requests. Start by requesting a game you'd like to see added.
      </p>
      <button
        type="button"
        onclick={onNewRequest}
        class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Make Your First Request
      </button>
    </div>
  {/if}
</div>
