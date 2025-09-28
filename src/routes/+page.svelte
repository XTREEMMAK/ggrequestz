<!--
  Overseerr-style game discovery dashboard
-->

<script>
  import GameCard from '../components/GameCard.svelte';
  // Lazy load GameModal only when needed
  let GameModal = $state(null);
  // Lazy load LoadingSpinner only when needed
  let LoadingSpinner = $state(null);
  import StatusBadge from '../components/StatusBadge.svelte';
  import SEOHead from '../components/SEOHead.svelte';
  import LoadMoreButton from '../components/LoadMoreButton.svelte';
  import SkeletonLoader from '../components/SkeletonLoader.svelte';
  import { goto, invalidate, invalidateAll, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { slide, fade, scale } from 'svelte/transition';
  import { quintOut, backOut } from 'svelte/easing';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  // Watchlist functions now imported via watchlistService above
  import { createHoverPreloader } from '$lib/utils.js';
  import { toasts } from '$lib/stores/toast.js';
  import { getGameByIdClient, warmGameCacheClient } from '$lib/gameCache.js';
  import { rommService, watchlistService } from '$lib/clientServices.js';
  import { batchGetWatchlistStatus, updateWatchlistStatus, getCachedWatchlistStatus } from '$lib/watchlistStatus.js';
  import { sidebarCollapsed } from '$lib/stores/sidebar.js';
  import Icon from '@iconify/svelte';
  
  let { data } = $props();

  let user = $derived(data?.user);
  let currentPath = $derived($page.url.pathname);
  let newInLibrary = $state(data?.newInLibrary || []);
  let newReleases = $state(data?.newReleases || []);
  let popularGames = $state(data?.popularGames || []);

  // Helper function to get user ID for API calls
  function getUserId() {
    // First try to use the resolved database user ID from server
    if (data.resolvedUserId) {
      return data.resolvedUserId;
    }

    if (!user) return null;

    // Direct ID from user object
    if (user.id) return user.id;

    // Check for user_id property (Authentik sessions)
    if (user.user_id) return user.user_id;

    // Extract from Basic Auth sub
    if (user.sub?.startsWith("basic_auth_")) {
      return user.sub.replace("basic_auth_", "");
    }

    // For other auth methods (Authentik), the ID should be in resolvedUserId
    return null;
  }
  
  // Progressive loading states to prevent image overload
  let showNewInLibrary = $state(true); // Show ROMM first
  let showNewReleases = $state(true); // Show second
  let showPopularGames = $state(true); // Show immediately - API is working
  let progressiveLoadingComplete = $state(false); // Track if progressive loading is done
  let recentRequests = $derived(data?.recentRequests || []);
  let userWatchlist = $derived(data?.userWatchlist || []);


  // Real-time watchlist status tracking
  let watchlistStatuses = $state(new Map());
  let rommAvailable = $derived(data?.rommAvailable || false);

  let genres = $state(data?.genres || []);
  let publishers = $state(data?.publishers || []);
  let systems = $state(data?.systems || []);
  
  // Loading states for Load More functionality
  let loadingNewInLibrary = $state(false);
  let loadingNewReleases = $state(false);
  let loadingPopular = $state(false);

  // Track if we just invalidated to prioritize server data
  let justInvalidated = $state(false);

  // Helper function to check if game is in watchlist
  function isGameInWatchlist(game) {
    const gameId = game.igdb_id || game.id;

    // Check real-time status first
    const realtimeStatus = watchlistStatuses.get(gameId);

    // Fall back to server data
    const serverStatus = userWatchlist.some(w => w.igdb_id == gameId);

    // Check for mismatches between client and server
    if (realtimeStatus !== undefined && realtimeStatus !== serverStatus) {
      let shouldUseServer = false;

      // If we just invalidated and there's a mismatch, trust server data
      if (justInvalidated) {
        shouldUseServer = true;
      }
      // Even without justInvalidated flag, if there's a clear server-client mismatch on page load, prioritize server
      // This handles cases where cache persisted across browser sessions
      else if (watchlistStatuses.size > 0 && userWatchlist.length > 0) {
        shouldUseServer = true;
      }

      if (shouldUseServer) {
        watchlistStatuses.delete(gameId);
        return serverStatus;
      }
    }

    // If we have a real-time status, use it
    if (realtimeStatus !== undefined) {
      return realtimeStatus;
    }

    // Otherwise use server status
    return serverStatus;
  }

  
  // Pagination tracking
  let newInLibraryPage = $state(1);
  let rommsPage = $state(1);
  let newReleasesPage = $state(1);
  let popularPage = $state(1);
  
  // Section expansion states - start in vertical grid view
  let newInLibraryExpanded = $state(true);
  let rommsExpanded = $state(true);
  let newReleasesExpanded = $state(true);

  let popularExpanded = $state(true);

  // Initial load limits - dynamically calculated based on viewport
  let rommsShowMore = $state(false);
  let newReleasesShowMore = $state(false);
  let popularShowMore = $state(false);

  // Calculate how many cards fit in exactly 2 rows based on viewport width
  function calculateDynamicLimit(width) {
    // Keep the original breakpoint system - CSS grid handles sidebar collapse space automatically
    // Fixed breakpoints to ensure exactly 2 rows and prevent overflow
    // Based on actual testing and user feedback for specific widths

    let limit;

    if (width >= 2000) {
      limit = 18; // 9 per row × 2 rows for ultra-wide screens
    } else if (width >= 1900) {
      limit = 16; // 8 per row × 2 rows for very wide screens
    } else if (width >= 1700) {
      limit = 14; // 7 per row × 2 rows for wide screens (1765px)
    } else if (width >= 1600) {
      limit = 10; // 5 per row × 2 rows for wide screens (1600px) - FIXED
    } else if (width >= 1400) {
      limit = 10; // 5 per row × 2 rows for xl screens (1395px)
    } else if (width >= 1260) {
      limit = 8;  // 4 per row × 2 rows for xl screens (1260-1379px)
    } else if (width >= 975) {
      limit = 10; // 5 per row × 2 rows for wide lg screens (975-1259px)
    } else if (width >= 780) {
      limit = 8;  // 4 per row × 2 rows for lg screens (780px+)
    } else if (width >= 700) {
      limit = 8;  // 4 per row × 2 rows for md-lg screens (700-779px)
    } else {
      limit = 6;  // 6 cards for small screens (≤699px) - CSS auto-fit with 150px minimum under 640px
    }

    return limit;
  }

  // Dynamic viewport-based display limits
  let viewportWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Calculate initial dynamic limit immediately using current viewport
  function getInitialLimit() {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      const limit = calculateDynamicLimit(width);
      // Initial limit calculated for viewport
      return limit;
    }
    // Server-side fallback applied
    return 10; // server-side fallback to show 2 rows
  }

  let dynamicDisplayLimit = $state(getInitialLimit());


  // Update dynamic limit when viewport changes - use onMount for better reliability
  onMount(() => {
    if (browser) {
      const updateLimit = () => {
        viewportWidth = window.innerWidth;
        const newLimit = calculateDynamicLimit(viewportWidth);
        // Dynamic limit updated for viewport
        dynamicDisplayLimit = newLimit;
      };

      // Force immediate calculation on mount
      updateLimit();

      window.addEventListener('resize', updateLimit);

      return () => window.removeEventListener('resize', updateLimit);
    }
  });

  // Derived arrays for display limiting with dynamic calculation
  // Always ensure we don't exceed the dynamic limit for initial display
  let displayedRomms = $derived(
    (() => {
      const limit = rommsShowMore ? newInLibrary.length : Math.min(dynamicDisplayLimit, newInLibrary.length);
      // ROMM display limit calculated
      return rommsShowMore ? newInLibrary : newInLibrary.slice(0, Math.min(dynamicDisplayLimit, newInLibrary.length));
    })()
  );
  let displayedNewReleases = $derived(
    newReleasesShowMore ? newReleases : newReleases.slice(0, Math.min(dynamicDisplayLimit, newReleases.length))
  );
  let displayedPopular = $derived(
    popularShowMore ? popularGames : popularGames.slice(0, Math.min(dynamicDisplayLimit, popularGames.length))
  );


  // State restoration flag to skip animations
  let isRestoringState = $state(false);
  let skipAnimations = $state(false);
  let isNavigatingBack = $state(false);

  // Card size control
  let cardSize = $state('medium'); // small, medium, large
  let showStickyNav = $state(false);
  let showFloatingToggle = $state(false);
  let floatingPanelOpen = $state(false);

  // Card size sliders (0-100 for continuous sizing) - separate for mobile and desktop
  let cardSizeSliderMobile = $state(50); // Default to medium
  let cardSizeSliderDesktop = $state(50); // Default to medium

  // Device detection - 768px is Tailwind's md breakpoint
  let isMobile = $state(false);

  // Load saved card size preferences
  onMount(() => {
    if (browser) {
      // Load mobile setting
      const savedMobileCardSize = localStorage.getItem('cardSizeSlider-mobile');
      if (savedMobileCardSize) {
        cardSizeSliderMobile = parseInt(savedMobileCardSize, 10);
      }

      // Load desktop setting
      const savedDesktopCardSize = localStorage.getItem('cardSizeSlider-desktop');
      if (savedDesktopCardSize) {
        cardSizeSliderDesktop = parseInt(savedDesktopCardSize, 10);
      }

      // Set initial device detection
      isMobile = window.innerWidth < 768;

      // Add resize listener for device detection
      const handleDeviceResize = () => {
        isMobile = window.innerWidth < 768;
      };
      window.addEventListener('resize', handleDeviceResize);

      return () => window.removeEventListener('resize', handleDeviceResize);
    }
  });

  // Get current card size slider value based on device
  let currentCardSizeSlider = $derived(isMobile ? cardSizeSliderMobile : cardSizeSliderDesktop);

  // Calculate dynamic card size based on current slider value (0-100)
  let dynamicCardSize = $derived.by(() => {
    // Map slider value (0-100) to card sizes (120px-300px for min, 140px-320px for max)
    const minSize = 120 + (currentCardSizeSlider * 1.8); // 120px to 300px
    const maxSize = 140 + (currentCardSizeSlider * 1.8); // 140px to 320px
    return { min: Math.round(minSize), max: Math.round(maxSize) };
  });

  // Update cardSize based on current slider value and save to preferences
  $effect(() => {
    // Calculate card size category for display based on current device slider
    if (currentCardSizeSlider <= 33) {
      cardSize = 'small';
    } else if (currentCardSizeSlider <= 66) {
      cardSize = 'medium';
    } else {
      cardSize = 'large';
    }
  });

  // Save mobile slider changes
  $effect(() => {
    if (browser) {
      localStorage.setItem('cardSizeSlider-mobile', cardSizeSliderMobile.toString());
    }
  });

  // Save desktop slider changes
  $effect(() => {
    if (browser) {
      localStorage.setItem('cardSizeSlider-desktop', cardSizeSliderDesktop.toString());
    }
  });

  // Functions for floating panel
  function toggleFloatingPanel() {
    floatingPanelOpen = !floatingPanelOpen;
  }

  function closeFloatingPanel() {
    floatingPanelOpen = false;
  }
  
  // Page load timestamp to ensure we only restore state from current session
  let pageLoadTimestamp = $state(Date.now());
  
  // Navigation and scroll management
  let savedScrollPosition = $state(0);
  let isNavigatingAway = $state(false); // Guard to prevent saving during navigation
  let lastSaveTime = 0; // Track last save to prevent rapid duplicates
  let scrollPositionLocked = false; // Lock to prevent any saves after initial save

  // Modal state
  let modalOpen = $state(false);
  let modalGame = $state(null);
  
  const ITEMS_PER_PAGE = 16;
  let loading = $derived(data?.loading || false);
  
  // Lazy load LoadingSpinner when loading state becomes true
  $effect(async () => {
    if (loading && !LoadingSpinner) {
      try {
        const module = await import('../components/LoadingSpinner.svelte');
        LoadingSpinner = module.default;
      } catch (error) {
        console.error('Failed to load LoadingSpinner:', error);
      }
    }
  });


  // Helper function for staggered card loading animation
  async function addGamesWithStagger(games, existingGames, updateFunction) {
    const STAGGER_DELAY = 150; // ms between each card
    let currentGames = [...existingGames];
    
    for (let i = 0; i < games.length; i++) {
      // Add one new game at a time to the existing array
      currentGames = [...currentGames, games[i]];
      updateFunction(currentGames);
      
      // Wait before adding next card (except for the last one)
      if (i < games.length - 1) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
      }
    }
  }
  
  // Simple state management
  
  function saveHomepageState() {
    if (!browser) return;
    
    const state = {
      newInLibrary,
      newReleases,
      popularGames,
      newInLibraryPage,
      rommsPage,
      newReleasesPage,
      popularPage,
      newInLibraryExpanded,
      rommsExpanded,
      newReleasesExpanded,
      popularExpanded,
      // Add load more states
      rommsShowMore,
      newReleasesShowMore,
      popularShowMore,
      timestamp: Date.now(), // Add timestamp for cache invalidation
      pageLoadTimestamp // Add page load timestamp to prevent cross-session restoration
    };
    
    
    // Save homepage state silently

    // Save state with content and timestamp
    sessionStorage.setItem('homepage_content_state', JSON.stringify(state));
  }
  
  function saveScrollPosition() {
    if (!browser) return;

    // If scroll position is locked (already saved for navigation), don't save again
    if (scrollPositionLocked) {
      return;
    }

    const currentScroll = window.scrollY;
    const now = Date.now();

    // Prevent rapid duplicate saves (within 100ms)
    if (now - lastSaveTime < 100) {
      console.log(`⚠️ Skipping rapid duplicate save (${now - lastSaveTime}ms since last save)`);
      return;
    }


    // Always save the current scroll position during navigation
    const existingSaved = sessionStorage.getItem('homepage_scroll_position');

    // Check if scroll position has changed significantly from last save
    if (existingSaved && Math.abs(parseInt(existingSaved) - currentScroll) < 50 && isNavigatingAway) {
      console.log(`⚠️ Scroll position hasn't changed much (${existingSaved}px → ${currentScroll}px), skipping save`);
      return;
    }

    savedScrollPosition = currentScroll;
    sessionStorage.setItem('homepage_scroll_position', savedScrollPosition.toString());
    lastSaveTime = now;

    // Also save in history state for browser back button
    if (browser) {
      replaceState('', { scrollY: savedScrollPosition });
    }

    // Scroll position saved
  }
  
  function restoreScrollPosition() {
    if (!browser) return;

    // Try to get scroll position from multiple sources
    let scrollY = null;

    // First, try history state
    if (window.history.state?.scrollY) {
      scrollY = window.history.state.scrollY;
      console.log(`📜 Found scroll in history state: ${scrollY}px`);
    }

    // Fallback to sessionStorage
    if (!scrollY) {
      const savedScroll = sessionStorage.getItem('homepage_scroll_position');
      if (savedScroll) {
        const parsedScroll = parseInt(savedScroll, 10);
        // Only use non-zero values
        if (parsedScroll > 0) {
          scrollY = parsedScroll;
          console.log(`💾 Found scroll in sessionStorage: ${scrollY}px`);
        } else {
          console.log(`⚠️ Ignoring zero scroll position from sessionStorage`);
        }
      }
    }

    if (scrollY && scrollY > 0) {
      console.log(`🔄 Restoring scroll position to ${scrollY}px`);

      // Enhanced approach: wait for content to be visible before scrolling
      const attemptRestore = (attempt = 1, maxAttempts = 20) => {
        // Check for multiple indicators that content is ready
        const hasContent = document.querySelector('[data-section="romms"], [data-section="new-releases"]');
        const hasCards = document.querySelectorAll('.poster-card').length > 0;
        const bodyHeight = document.body.scrollHeight > window.innerHeight;

        const isReady = (hasContent || hasCards) && bodyHeight;

        if (isReady || attempt >= maxAttempts) {
          // Wait for next frame to ensure layout is complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Force scroll with fallback methods
              window.scrollTo(0, scrollY);

              // Fallback: use scrollTop if scrollTo doesn't work
              setTimeout(() => {
                if (window.scrollY < scrollY - 50) {
                  document.documentElement.scrollTop = scrollY;
                  document.body.scrollTop = scrollY;
                }

                const actualScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
                // Scroll restored successfully

                // Only clear if we successfully restored the position
                if (Math.abs(actualScroll - scrollY) < 50) {
                  sessionStorage.removeItem('homepage_scroll_position');
                } else {
                  console.log(`⚠️ Scroll position mismatch (target: ${scrollY}, actual: ${actualScroll}), retrying...`);
                  // Try one more time after a delay
                  setTimeout(() => {
                    window.scrollTo(0, scrollY);
                  }, 500);
                }
              }, 100);
            });
          });
        } else {
          console.log(`⏳ Content not ready (hasContent: ${!!hasContent}, hasCards: ${hasCards}, bodyHeight: ${bodyHeight}), attempt ${attempt}/${maxAttempts}`);
          setTimeout(() => attemptRestore(attempt + 1, maxAttempts), 100);
        }
      };

      attemptRestore();
    } else {
      console.log(`❌ No saved scroll position found`);
    }
  }
  
  function restoreHomepageState() {
    if (!browser) return;
    
    const savedState = sessionStorage.getItem('homepage_content_state');
    if (!savedState) return;
    
    try {
      const cachedData = JSON.parse(savedState);
      
      // Check if cache is still valid (5 minutes)
      const cacheAge = Date.now() - (cachedData.timestamp || 0);
      const maxCacheAge = 5 * 60 * 1000; // 5 minutes

      if (cacheAge > maxCacheAge) {
        sessionStorage.removeItem('homepage_content_state');
        return;
      }

      // Only clear if the state is from a much earlier browser session
      // For navigation-based state restoration, be very lenient
      const sessionAge = Math.abs(pageLoadTimestamp - (cachedData.pageLoadTimestamp || 0));
      const maxSessionAge = 30 * 60 * 1000; // 30 minutes - very generous for browser tab sessions

      if (sessionAge > maxSessionAge) {
        console.log(`🗑️ Clearing very old homepage state (${Math.round(sessionAge / 60000)} minutes old)`);
        sessionStorage.removeItem('homepage_content_state');
        return;
      }
      
      
      // Set flags to skip animations and progressive loading during restoration
      skipAnimations = true;
      isNavigatingBack = true;
      isRestoringState = true;
      
      // Restore games data if cached data has different content or pagination state
      if (cachedData.newInLibrary && (cachedData.newInLibrary.length > newInLibrary.length || cachedData.newInLibraryPage > 1)) {
        newInLibrary = cachedData.newInLibrary;
        newInLibraryPage = cachedData.newInLibraryPage || 1;
      }
      if (cachedData.newReleases && (cachedData.newReleases.length > newReleases.length || cachedData.newReleasesPage > 1)) {
        newReleases = cachedData.newReleases;
        newReleasesPage = cachedData.newReleasesPage || 1;
      }
      if (cachedData.popularGames && (cachedData.popularGames.length > popularGames.length || cachedData.popularPage > 1)) {
        popularGames = cachedData.popularGames;
        popularPage = cachedData.popularPage || 1;
      }
      
      // Restore expansion states
      if (cachedData.newInLibraryExpanded !== undefined) newInLibraryExpanded = cachedData.newInLibraryExpanded;
      if (cachedData.rommsExpanded !== undefined) rommsExpanded = cachedData.rommsExpanded;
      if (cachedData.newReleasesExpanded !== undefined) newReleasesExpanded = cachedData.newReleasesExpanded;
      if (cachedData.popularExpanded !== undefined) popularExpanded = cachedData.popularExpanded;

      // Restore load more states
      if (cachedData.rommsShowMore !== undefined) rommsShowMore = cachedData.rommsShowMore;
      if (cachedData.newReleasesShowMore !== undefined) newReleasesShowMore = cachedData.newReleasesShowMore;
      if (cachedData.popularShowMore !== undefined) popularShowMore = cachedData.popularShowMore;
      
      // Sections are already shown immediately by onMount/afterNavigate hooks
      
      // Re-enable animations after a brief delay
      setTimeout(() => {
        skipAnimations = false;
        isRestoringState = false;
        // Don't clear immediately - let afterNavigate handle it if needed
      }, 300);
      
    } catch (error) {
      console.error('Failed to restore homepage state:', error);
      sessionStorage.removeItem('homepage_content_state');
    }
  }
  
  
  // References for horizontal scrolling
  let newInLibraryScroll = $state();
  let rommsScroll = $state();
  let newReleasesScroll = $state();
  let popularScroll = $state();
  
  function scrollHorizontally(element, direction) {
    if (element) {
      const scrollAmount = 240; // Width of card + gap
      element.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }
  
  function handleGameRequest({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }
    goto(`/request?game=${detail.game.igdb_id || detail.game.id}`);
  }
  
  async function handleWatchlist({ detail }) {
    if (!user) {
      goto('/api/auth/login');
      return;
    }

    const game = detail.game;
    const gameId = game.igdb_id || game.id;
    const isCurrentlyInWatchlist = isGameInWatchlist(game);

    try {
      if (isCurrentlyInWatchlist) {
        // Remove from watchlist
        const result = await watchlistService.removeFromWatchlist(gameId);

        // Always update local state to "removed" regardless of API result
        // This handles cases where the game wasn't actually in the DB
        watchlistStatuses = new Map(watchlistStatuses.set(gameId, false));
        updateWatchlistStatus(gameId, false);

        // Invalidate SvelteKit cache to refresh watchlist data
        if (browser) {
          // Small delay to ensure database transaction completes
          await new Promise(resolve => setTimeout(resolve, 100));
          await invalidateAll();

          // Set flag to prioritize server data over stale client cache
          justInvalidated = true;

          // Clear ALL stale client-side statuses after invalidation
          setTimeout(() => {
            watchlistStatuses = new Map(); // Clear entire client cache

            // Reset invalidation flag after cleanup
            setTimeout(() => {
              justInvalidated = false;
            }, 100);
          }, 200);

        }

        toasts.success(`${game.title} removed from watchlist`);
      } else {
        // Add to watchlist
        const gameData = {
          title: game.title,
          cover_url: game.cover_url,
          platforms: game.platforms,
          genres: game.genres,
          rating: game.rating,
          release_date: game.release_date
        };

        const success = await watchlistService.addToWatchlist(gameId, gameData);
        if (success) {
          // Update real-time status immediately for UI feedback
          watchlistStatuses = new Map(watchlistStatuses.set(gameId, true));
          updateWatchlistStatus(gameId, true);

          // Invalidate SvelteKit cache to refresh watchlist data
          if (browser) {
            // Small delay to ensure database transaction completes
            await new Promise(resolve => setTimeout(resolve, 100));
            await invalidateAll();

            // Set flag to prioritize server data over stale client cache
            justInvalidated = true;

            // Clear ALL stale client-side statuses after invalidation (consistent with remove)
            setTimeout(() => {
              watchlistStatuses = new Map(); // Clear entire client cache

              // Reset invalidation flag after cleanup
              setTimeout(() => {
                justInvalidated = false;
              }, 100);
            }, 200);

          }

          toasts.success(`${game.title} added to watchlist`);
        } else {
          throw new Error('Failed to add to watchlist');
        }
      }
    } catch (error) {
      console.error('Watchlist error:', error);
      toasts.error('Failed to update watchlist. Please try again.');
    }
  }
  
  
  async function handleShowModal({ detail }) {
    // Lazy load GameModal component when first needed
    if (!GameModal) {
      try {
        const module = await import('../components/GameModal.svelte');
        GameModal = module.default;
      } catch (error) {
        console.error('Failed to load GameModal:', error);
        return;
      }
    }
    
    modalGame = detail.game;
    modalOpen = true;
  }
  
  function handleCloseModal() {
    modalOpen = false;
    modalGame = null;
  }

  
  function handleModalRequest({ detail }) {
    // Close modal and redirect to request page
    handleCloseModal();
    goto(`/request?game=${detail.game.igdb_id}`);
  }
  
  function handleModalWatchlist({ detail }) {
    // Delegate to existing watchlist handler
    handleWatchlist({ detail });
  }
  
  function handleModalViewDetails({ detail }) {
    // Save state before navigation
    saveHomepageState();
    saveScrollPosition();

    // Close modal and redirect to details page
    handleCloseModal();
    goto(`/game/${detail.game.igdb_id || detail.game.id}`);
  }

  function handleGameCardClick(event) {
    // Save homepage state and scroll position before navigation
    const currentScroll = window.scrollY;
    console.log(`🎮 GameCard clicked at scroll position ${currentScroll}px`);

    // Set guard immediately to prevent any duplicate saves
    isNavigatingAway = true;

    // Save state and position
    saveHomepageState();
    saveScrollPosition();

    // Lock scroll position to prevent any further saves during navigation
    scrollPositionLocked = true;
    // Lock scroll position to prevent duplicate saves

    // Keep guard active until well after navigation completes
    setTimeout(() => {
      isNavigatingAway = false;
      // Don't unlock here - let afterNavigate handle it when we return
    }, 1000);

    // Handle navigation for view-details events (from ROMM GameCards with preserveState)
    if (event?.detail?.game) {
      const game = event.detail.game;
      const gameId = game.igdb_id || game.id;
      goto(`/game/${gameId}`, { noScroll: false, replaceState: false });
    }
  }
  
  // Removed unused functions loadMoreNewInLibrary and loadMoreROMs

  async function loadMoreNewReleases() {
    if (loadingNewReleases) return;

    // First check if we have hidden content to show
    if (!newReleasesShowMore && newReleases.length > dynamicDisplayLimit) {
      newReleasesShowMore = true;
      return;
    }

    loadingNewReleases = true;
    try {
      // Performance timing for load more operation
      const startTime = performance.now();

      // Try to use preloaded data first
      let data = newReleasesPreloader.getCached();
      
      if (!data) {
        // Fallback to manual fetch if no preloaded data
        const userId = getUserId();
        const userParam = userId ? `&user_id=${userId}` : '';
        const response = await fetch(`/api/games/recent?page=${newReleasesPage + 1}&limit=${ITEMS_PER_PAGE}${userParam}`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      if (data?.games && data.games.length > 0) {
        // Prefetch images for new games
        data.games.forEach(game => {
          if (game.cover_url) {
            // Temporarily disabled: prefetcher.prefetch(game.cover_url, 'image');
          }
        });
        
        // Add games one by one with staggered animation
        await addGamesWithStagger(data.games, newReleases, (updatedGames) => {
          newReleases = updatedGames;
        });
        newReleasesPage += 1;
      }
      
    } catch (error) {
      console.error('Failed to load more new releases:', error);
    } finally {
      loadingNewReleases = false;
    }
  }
  
  async function loadMorePopular() {
    if (loadingPopular) return;

    // First check if we have hidden content to show
    if (!popularShowMore && popularGames.length > dynamicDisplayLimit) {
      popularShowMore = true;
      return;
    }

    loadingPopular = true;
    try {
      // Performance timing for load more operation
      const startTime = performance.now();

      // Clear any stale cached data for the current page
      const currentCacheKey = `popular-games-${popularPage + 1}`;
      
      // Try to use preloaded data first (only if it's for the right page)
      let data = null;
      const cachedData = popularGamesPreloader.getCached();
      
      // Verify cached data is for the correct page
      if (cachedData && cachedData.page === popularPage + 1) {
        data = cachedData;
      }
      
      if (!data) {
        // Fallback to manual fetch if no valid preloaded data
        const userId = getUserId();
        const userParam = userId ? `&user_id=${userId}` : '';
        const response = await fetch(`/api/games/popular?page=${popularPage + 1}&limit=${ITEMS_PER_PAGE}${userParam}`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      if (data?.games && data.games.length > 0) {
        // Prefetch images for new games
        data.games.forEach(game => {
          if (game.cover_url) {
            // Temporarily disabled: prefetcher.prefetch(game.cover_url, 'image');
          }
        });
        
        // Add games one by one with staggered animation
        await addGamesWithStagger(data.games, popularGames, (updatedGames) => {
          popularGames = updatedGames;
        });
        popularPage += 1;
        
        // Clear the cache for the page we just loaded to prevent stale data
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(currentCacheKey);
        }
      }
      
      // Log performance timing
      const duration = performance.now() - startTime;
      console.log(`⏱️ load-more-popular-games: ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error('Failed to load more popular games:', error);
    } finally {
      loadingPopular = false;
    }
  }
  
  // Simplified navigation hooks - reduce interference with browser history
  beforeNavigate((navigation) => {
    if (!browser) return;

    // Only log when going to game details
    if (navigation.to?.url.pathname.startsWith('/game/')) {
      console.log(`🚀 Navigating to game details`);
    }

    // Only save state when leaving the homepage for a game detail page
    if (window.location.pathname === '/' && navigation.to?.url.pathname.startsWith('/game/')) {
      // Check if already saved by GameCard click handler
      const existingSaved = sessionStorage.getItem('homepage_scroll_position');
      const currentScroll = window.scrollY;

      // Only save if not already saved or if scroll position has significantly changed
      if (!existingSaved || Math.abs(parseInt(existingSaved) - currentScroll) > 100) {
        console.log(`💾 Saving state in beforeNavigate (fallback for non-GameCard navigation)`);
        isNavigatingAway = true; // Set guard before saving
        saveHomepageState();
        saveScrollPosition();
        scrollPositionLocked = true; // Lock after save
        // Lock scroll position to prevent duplicate saves
      } else {
        // State already saved, skipping
        isNavigatingAway = true; // Still set guard to prevent other saves
        scrollPositionLocked = true; // Lock to prevent any further saves
      }

      // Keep the guard active briefly to prevent duplicate saves
      setTimeout(() => {
        isNavigatingAway = false;
        // Don't unlock here - let afterNavigate handle it when we return
      }, 500);
    }
  });
  
  afterNavigate(async (navigation) => {
    if (!browser) return;

    // Reset navigation guard and unlock when arriving at the page
    isNavigatingAway = false;

    // Unlock scroll position when returning to homepage
    if (window.location.pathname === '/') {
      scrollPositionLocked = false;
      // Unlock scroll position on homepage
    }

    // Only log navigation from game details
    if (navigation.from?.url.pathname.startsWith('/game/')) {
      // Navigation from game detail detected
    }

    // Only restore when returning from a game detail page
    if (window.location.pathname === '/' && navigation.from?.url.pathname.startsWith('/game/')) {
      // Detected back navigation from game details

      // Set flag that we're navigating back
      isNavigatingBack = true;

      // Show all sections immediately when navigating back
      showNewInLibrary = true;
      showNewReleases = true;
      showPopularGames = true;

      // Attempt to restore state if we have any
      const hasSavedState = sessionStorage.getItem('homepage_content_state');
      if (hasSavedState) {
        // Restoring homepage state
        restoreHomepageState();
        // Don't clear state immediately - keep it for multiple navigations
        // It will be cleared when we navigate away again or after a longer timeout
      }

      // Restore scroll position with built-in content detection
      setTimeout(() => {
        restoreScrollPosition();
      }, 150);
    }
  });
  
  onDestroy(() => {
    // Component cleanup - minimal state management
    if (browser) {
      saveScrollPosition();
    }
  });
  
  onMount(() => {
    // Unlock scroll position on mount (for page refreshes or direct navigation)
    scrollPositionLocked = false;

    // Disable browser's automatic scroll restoration so we can handle it manually
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
      // Set scroll restoration to manual
    }

    // Handle browser back button navigation
    const handlePopState = (event) => {
      console.log(`🔄 Browser back button detected`, event.state);
      // Small delay to let SvelteKit handle the navigation first
      setTimeout(() => {
        if (window.location.pathname === '/') {
          // Returned to homepage via browser back button
          // Check if we have scroll position in state or storage
          if (event.state?.scrollY || sessionStorage.getItem('homepage_scroll_position')) {
            // Detected saved scroll position, restoring
            restoreScrollPosition();
          }
        }
      }, 100);
    };

    window.addEventListener('popstate', handlePopState);

    // Restore state when coming back to homepage
    const performance = window.performance?.getEntriesByType('navigation')[0];
    const isPageRefresh = performance?.type === 'reload';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Check if we're coming back from navigation (has saved state)
    const hasSavedState = sessionStorage.getItem('homepage_content_state');
    const hasSavedScroll = sessionStorage.getItem('homepage_scroll_position');

    // If we have saved scroll position, we're likely returning from somewhere
    if (hasSavedScroll && !isPageRefresh) {
      // Found saved scroll position, attempting restore
      // Wait for initial content to load
      setTimeout(() => {
        restoreScrollPosition();
      }, 300);
    }


    if (isPageRefresh) {
      // On page refresh, don't aggressively clear state - let restoreHomepageState handle validation
      isNavigatingBack = false;
    } else if (hasSavedState) {
      // We have saved state (either from navigation or from current session after refresh)

      // Show all sections immediately when we might restore state
      showNewInLibrary = true;
      showNewReleases = true;
      showPopularGames = true;

      // Try to restore state
      if (isMobile) {
        setTimeout(() => {
          restoreHomepageState();
        }, 100);
      } else {
        restoreHomepageState();
      }
    } else {
      // Fresh load - ensure navigation flag is false for progressive loading
      isNavigatingBack = false;
    }

    // Cleanup event listener on component destroy
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Restore browser's default scroll behavior
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto';
      }
    };
  });
  
  // Handle floating toggle visibility and save scroll position periodically
  onMount(() => {
    if (browser) {
      const handleScroll = () => {
        // Show floating toggle after scrolling down 100px
        const newToggleState = window.scrollY > 100;
        if (newToggleState !== showFloatingToggle) {
          console.log(`Floating toggle ${newToggleState ? 'show' : 'hide'} at scroll: ${window.scrollY}px`);
        }
        showFloatingToggle = newToggleState;
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // Warm cache for games in initial viewport
      setTimeout(() => {
        warmInitialViewportGames();
      }, 500); // Small delay to let initial render complete
      
      // Enhance with ROMM data if available (progressive enhancement)
      if (data.rommAvailable && data.needsRommCrossReference) {
        setTimeout(() => {
          enhanceWithRommData();
        }, 1000); // Additional delay for ROMM enhancement
      }
      
      return () => window.removeEventListener('scroll', handleScroll);
    }
  });
  
  // Progressive loading to prevent image overload - ROMM first, then New Releases, then Popular
  onMount(() => {
    if (browser && !isNavigatingBack && !progressiveLoadingComplete) {
      // Only do progressive loading if not navigating back from cache
      // Use Promise-based approach to avoid race conditions
      const progressiveLoad = async () => {
        // Wait a bit for ROMM to render
        await new Promise(resolve => setTimeout(resolve, 800));
        
        if (!isNavigatingBack && !progressiveLoadingComplete) {
          showNewReleases = true;
        }
        
        // Wait for New Releases to render
        await new Promise(resolve => setTimeout(resolve, 800));
        
        if (!isNavigatingBack && !progressiveLoadingComplete) {
          showPopularGames = true;
          progressiveLoadingComplete = true;
        }
      };
      
      progressiveLoad().catch(console.error);
    } else if (isNavigatingBack) {
      // When navigating back, show all sections immediately
      showNewReleases = true;
      showPopularGames = true;
      progressiveLoadingComplete = true;
    }
  });

  // Initialize watchlist status from cache on page load (runs only once)
  let hasInitialized = false;
  $effect(() => {
    if (!browser || !user || hasInitialized) return;

    // Get cached statuses for all games on initial load
    const allGameIds = [];
    [...newInLibrary, ...newReleases, ...popularGames].forEach(game => {
      const gameId = game.igdb_id || game.id;
      if (gameId && !allGameIds.includes(gameId)) {
        allGameIds.push(gameId);
      }
    });

    // Only sync from cache, no API calls to avoid infinite loops
    const cachedStatuses = new Map();
    allGameIds.forEach(gameId => {
      const cached = getCachedWatchlistStatus(gameId);
      if (cached !== null) {
        cachedStatuses.set(gameId, cached);
      }
    });

    if (cachedStatuses.size > 0) {
      watchlistStatuses = cachedStatuses; // Don't spread existing Map to avoid loop
    }
    hasInitialized = true;
  });

  // Fetch real-time watchlist statuses - always refresh when new games are added
  let watchlistLoadPromise = null;
  let lastCheckedGameIds = new Set();



  $effect(() => {
    // Only proceed if we have a properly authenticated user with sub field
    if (!browser || !user || !user.sub) return;

    // Get all visible game IDs
    const allGameIds = [];
    [...newInLibrary, ...newReleases, ...popularGames].forEach(game => {
      const gameId = game.igdb_id || game.id;
      if (gameId && !allGameIds.includes(gameId)) {
        allGameIds.push(gameId);
      }
    });

    // Find game IDs that haven't been checked yet
    const uncheckedGameIds = allGameIds.filter(id => !lastCheckedGameIds.has(String(id)));

    if (uncheckedGameIds.length > 0 && !watchlistLoadPromise) {
      // Wait for page to be fully loaded and user to be authenticated
      const timeout = setTimeout(() => {
        // Double check user is still valid and page is ready
        if (user && user.sub) {
          watchlistLoadPromise = batchGetWatchlistStatus(uncheckedGameIds)
            .then(statuses => {
              if (statuses.size > 0) {
                // Merge new statuses with existing ones
                const mergedStatuses = new Map(watchlistStatuses);
                statuses.forEach((value, key) => mergedStatuses.set(key, value));
                watchlistStatuses = mergedStatuses;
              }
              // Mark these games as checked
              uncheckedGameIds.forEach(id => lastCheckedGameIds.add(String(id)));
            })
            .catch(error => {
              // Handle errors silently
            })
            .finally(() => {
              watchlistLoadPromise = null; // Reset for future calls
            });
        }
      }, 200); // Shorter delay for dynamically loaded games

      return () => clearTimeout(timeout);
    }
  });

  // Warm cache for games visible in initial viewport with performance monitoring
  async function warmInitialViewportGames() {
    const startTime = performance.now();
      try {
        const gameCards = document.querySelectorAll('[data-game-id]');
        const viewportHeight = window.innerHeight;
        const gamesToWarm = [];
        
        gameCards.forEach(card => {
          const rect = card.getBoundingClientRect();
          // Check if card is in viewport (with some buffer)
          if (rect.top < viewportHeight + 100 && rect.bottom > -100) {
            const gameId = card.dataset.gameId;
            if (gameId) {
              gamesToWarm.push(gameId);
              // Prefetch critical images for viewport games
              const img = card.querySelector('img[data-src]');
              if (img?.dataset.src) {
                // Temporarily disabled: prefetcher.prefetch(img.dataset.src, 'image', true);
              }
            }
          }
        });
        
        if (gamesToWarm.length > 0) {
          console.log(`🔥 Warming cache for ${gamesToWarm.length} games in initial viewport`);
          await warmGameCacheClient(gamesToWarm);
        }
      } catch (error) {
        console.warn('Failed to warm initial viewport games:', error);
      }
      
      // Log performance timing
      const duration = performance.now() - startTime;
      console.log(`⏱️ viewport-cache-warming: ${duration.toFixed(2)}ms`);
  }
  
  // Enhance games with ROMM data progressively with performance monitoring
  async function enhanceWithRommData() {
    const startTime = performance.now();
      try {
        // Start with popular games (most likely to be viewed)
        if (popularGames.length > 0) {
          // Enhancing popular games with ROMM data
          const enhancedPopular = await rommService.crossReference(popularGames);
          popularGames = enhancedPopular;
        }
        
        // Then enhance new releases
        if (newReleases.length > 0) {
          console.log('🆕 Enhancing new releases with ROMM data...');
          const enhancedReleases = await rommService.crossReference(newReleases);
          newReleases = enhancedReleases;
        }
        
        console.log('✨ ROMM enhancement complete');
      } catch (error) {
        console.warn('ROMM enhancement failed:', error);
        throw error;
      }
      
      // Log performance timing
      const duration = performance.now() - startTime;
      console.log(`⏱️ romm-data-enhancement: ${duration.toFixed(2)}ms`);
  }


  // Scroll to section function
  function scrollToSection(sectionId) {
    const element = document.querySelector(`[data-section="${sectionId}"]`);
    if (element) {
      const yOffset = -80; // Account for sticky nav height
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  // Get section visibility and availability
  function getSections() {
    return [
      { id: 'romms', name: 'New in Library', visible: rommAvailable && showNewInLibrary, count: newInLibrary.length },
      { id: 'new-releases', name: 'New Releases', visible: showNewReleases, count: newReleases.length },
      { id: 'popular-games', name: 'Popular Games', visible: showPopularGames, count: popularGames.length }
    ].filter(section => section.visible && section.count > 0);
  }
  
  // Create hover preloaders for Load More buttons
  const newReleasesPreloader = $derived(createHoverPreloader(
    () => {
      const userId = getUserId();
      const userParam = userId ? `&user_id=${userId}` : '';
      return fetch(`/api/games/recent?page=${newReleasesPage + 1}&limit=${ITEMS_PER_PAGE}${userParam}`).then(r => r.json());
    },
    { delay: 200, cacheKey: `new-releases-${newReleasesPage + 1}` }
  ));
  
  const popularGamesPreloader = $derived(createHoverPreloader(
    () => {
      const userId = getUserId();
      const userParam = userId ? `&user_id=${userId}` : '';
      return fetch(`/api/games/popular?page=${popularPage + 1}&limit=${ITEMS_PER_PAGE}${userParam}`).then(r => r.json());
    },
    { delay: 200, cacheKey: `popular-games-${popularPage + 1}` }
  ));
</script>

<SEOHead 
  title="Discover - G.G Requestz"
  description="Discover new games, search our extensive library, and request your favorites. Your ultimate gaming companion."
  ogTitle="G.G Requestz - Discover Amazing Games"
  ogDescription="Explore our extensive game library with powerful search and filtering. Request your favorite games and build your personal watchlist."
/>

<div class="px-8 py-6 max-w-full dynamic-card-size {$sidebarCollapsed ? 'sidebar-collapsed' : ''}" style="--card-min-size: {dynamicCardSize.min}px; --card-max-size: {dynamicCardSize.max}px; --card-min-size-mobile: {Math.max(100, dynamicCardSize.min - 20)}px; --card-max-size-mobile: {Math.max(120, dynamicCardSize.max - 20)}px;">
  
  <!-- Mobile Logo Section -->
  <div class="lg:hidden text-center mb-8">
    <h1 class="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
      G.G Requestz
    </h1>
    <p class="text-gray-400 mt-2 text-lg">Discover & Request Amazing Games</p>
  </div>

  <!-- Floating Toggle Button - Always visible on right edge -->
  <button
    type="button"
    onclick={toggleFloatingPanel}
    class="fixed top-1/2 right-0 transform -translate-y-1/2 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-l-lg shadow-lg transition-all duration-300 ease-out hover:scale-105 hover:right-1"
    aria-label="Toggle navigation panel"
  >
    <Icon icon="line-md:menu-fold-left" class="w-5 h-5" />
  </button>

  <!-- Floating Panel -->
  {#if floatingPanelOpen}
    <!-- Mobile backdrop -->
    <div
      class="fixed inset-0 bg-black/50 z-40 lg:hidden"
      onclick={closeFloatingPanel}
      in:fade={{ duration: 200 }}
      out:fade={{ duration: 200 }}
    ></div>

    <!-- Panel -->
    <div
      class="fixed top-1/2 right-16 transform -translate-y-1/2 z-50 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-xl shadow-xl w-80 max-w-[calc(100vw-5rem)] lg:right-20"
      in:scale={{ duration: 300, start: 0.8, easing: quintOut }}
      out:scale={{ duration: 200, start: 0.8 }}
    >
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Quick Navigation</h3>
          <button
            type="button"
            onclick={closeFloatingPanel}
            class="text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Section Quick Links -->
        <div class="mb-6">
          <h4 class="text-sm font-medium text-gray-400 mb-3">Jump to Section:</h4>
          <div class="space-y-2">
            {#each getSections() as section}
              <button
                type="button"
                onclick={() => {
                  scrollToSection(section.id);
                  closeFloatingPanel();
                }}
                class="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors duration-200 flex items-center justify-between"
              >
                <span>{section.name}</span>
                <span class="text-gray-500 text-sm">({section.count})</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Card Size Slider -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium text-gray-400">Card Size:</h4>
            <span class="text-xs px-2 py-1 rounded-full {isMobile ? 'bg-orange-600 text-orange-100' : 'bg-blue-600 text-blue-100'}">
              {isMobile ? 'Mobile' : 'Desktop'}
            </span>
          </div>
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span>Small</span>
              <span>Medium</span>
              <span>Large</span>
            </div>
            {#if isMobile}
              <input
                type="range"
                min="0"
                max="100"
                bind:value={cardSizeSliderMobile}
                class="w-full h-2 bg-gray-700 rounded-lg appearance-none slider"
              />
            {:else}
              <input
                type="range"
                min="0"
                max="100"
                bind:value={cardSizeSliderDesktop}
                class="w-full h-2 bg-gray-700 rounded-lg appearance-none slider"
              />
            {/if}
            <div class="text-center">
              <span class="text-sm text-gray-300 font-medium">
                Current: {cardSize.charAt(0).toUpperCase() + cardSize.slice(1)}
              </span>
              <div class="text-xs text-gray-500 mt-1">
                Separate settings for mobile and desktop
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      {#if LoadingSpinner}
        <svelte:component this={LoadingSpinner} size="lg" text="Loading games..." />
      {:else}
        <!-- Fallback loading indicator -->
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      {/if}
    </div>
  {:else}
    
    <!-- New in Library from ROMM -->
{#if rommAvailable && showNewInLibrary}
  <section class="mb-10" data-section="romms">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
      <div class="flex items-center gap-3">
        <h2 class="text-4xl font-bold text-white">New in Library</h2>
        <span class="text-xs bg-green-600 text-white px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">ROMM Library</span>
      </div>
      <div class="flex items-center gap-2 justify-center sm:justify-end">
        
        {#if !rommsExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(rommsScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(rommsScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if newInLibrary.length > 0}
      {#if rommsExpanded}
        <!-- Expanded vertical grid layout with dynamic columns -->
        <div
          class="responsive-grid gap-3 sm:gap-4 xl:gap-6 transition-all duration-500 ease-out {$sidebarCollapsed ? 'sidebar-collapsed' : ''}"
          in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
        >
          {#each displayedRomms as game, index}
            <div
              in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
            >
              <GameCard
                {game}
                {user}
                isInWatchlist={isGameInWatchlist(game)}
                preserveState={true}
                enablePreloading={true}
                on:request={handleGameRequest}
                on:watchlist={handleWatchlist}
                on:show-modal={handleShowModal}
                on:click={handleGameCardClick}
                on:view-details={handleGameCardClick}
              />
            </div>
          {/each}
        </div>

        <!-- Load More Button for ROMM section -->
        {#if !rommsShowMore && newInLibrary.length > dynamicDisplayLimit}
          <div class="text-center mt-6">
            <button
              type="button"
              onclick={() => rommsShowMore = true}
              class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 mx-auto"
            >
              Load More ({newInLibrary.length - dynamicDisplayLimit} remaining)
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>
        {/if}
      {:else}
        <!-- Default horizontal scroll layout -->
        <div
          class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[420px]"
          bind:this={rommsScroll}
          in:slide={{ duration: 300, easing: quintOut }}
        >
          {#each newInLibrary as game, index}
            <div class="flex-shrink-0 w-48" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
              <GameCard
                {game}
                {user}
                isInWatchlist={isGameInWatchlist(game)}
                preserveState={true}
                enablePreloading={true}
                on:request={handleGameRequest}
                on:watchlist={handleWatchlist}
                on:show-modal={handleShowModal}
                on:click={handleGameCardClick}
                on:view-details={handleGameCardClick}
              />
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Loading skeleton when no games yet -->
      <div class="responsive-grid gap-3 sm:gap-4 xl:gap-6 {$sidebarCollapsed ? 'sidebar-collapsed' : ''}">
        {#each Array(10) as _, i}
          <SkeletonLoader variant="card" rounded="lg" />
        {/each}
      </div>
    {/if}

    
  </section>
{/if}

    <!-- New Releases from IGDB -->
    {#if showNewReleases}
    <section class="mb-10" data-section="new-releases">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-4xl font-bold text-white">New Releases</h2>
        <!-- Desktop scroll arrows - hidden when expanded -->
        {#if !newReleasesExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(newReleasesScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(newReleasesScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
      
      {#if newReleases.length > 0}
        {#if newReleasesExpanded}
          <!-- Expanded vertical grid layout with dynamic responsive columns -->
          <div
            class="responsive-grid gap-3 sm:gap-4 xl:gap-6 transition-all duration-500 ease-out {$sidebarCollapsed ? 'sidebar-collapsed' : ''}"
            in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
          >
            {#each displayedNewReleases as game, index}
              <div 
                in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
              >
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>

        {:else}
          <!-- Default horizontal scrolling layout -->
          <div
            class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[400px]"
            bind:this={newReleasesScroll}
            in:slide={{ duration: 300, easing: quintOut }}
          >
            {#each newReleases as game, index}
              <div class="flex-shrink-0 w-62" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Load More Button -->
        <div class="flex justify-center mt-6">
          <LoadMoreButton
            loading={loadingNewReleases}
            disabled={loadingNewReleases}
            preloader={newReleasesPreloader}
            on:load={loadMoreNewReleases}
          />
        </div>
      {:else}
        <div class="text-center py-8 text-gray-400">
          <p>No new releases available</p>
        </div>
      {/if}
    </section>
    {/if}
    
    <!-- Popular Games -->
    {#if showPopularGames}
    <section class="mb-10" data-section="popular-games">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-4xl font-bold text-white">Popular Games</h2>
        <!-- Desktop scroll arrows - hidden when expanded -->
        {#if !popularExpanded}
          <div class="hidden md:flex items-center gap-1">
            <button
              onclick={() => scrollHorizontally(popularScroll, 'left')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll left"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontally(popularScroll, 'right')}
              class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              aria-label="Scroll right"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
      
      {#if popularGames.length > 0}
        {#if popularExpanded}
          <!-- Expanded vertical grid layout with dynamic responsive columns -->
          <div
            class="responsive-grid gap-3 sm:gap-4 xl:gap-6 transition-all duration-500 ease-out {$sidebarCollapsed ? 'sidebar-collapsed' : ''}"
            in:slide={{ duration: 500, easing: quintOut, axis: 'y' }}
          >
            {#each displayedPopular as game, index}
              <div 
                in:scale={skipAnimations || isRestoringState ? { duration: 0 } : { duration: 400, easing: backOut, delay: index * 50, start: 0.8 }}
              >
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {:else}
          <!-- Default horizontal scrolling layout -->
          <div
            class="flex overflow-x-auto scrollbar-hide gap-6 pb-8 px-1 pt-2 transition-all duration-300 ease-out min-h-[420px]"
            bind:this={popularScroll}
            in:slide={{ duration: 300, easing: quintOut }}
          >
            {#each displayedPopular as game, index}
              <div class="flex-shrink-0 w-48" in:fade={skipAnimations ? { duration: 0 } : { delay: index * 30, duration: 200 }}>
                <GameCard 
                  {game} 
                  {user}
                  isInWatchlist={isGameInWatchlist(game)}
                  enablePreloading={true}
                  on:request={handleGameRequest}
                  on:watchlist={handleWatchlist}
                      on:show-modal={handleShowModal}
                />
              </div>
            {/each}
          </div>
        {/if}
        
        <!-- Load More Button (only show if there are more items or in expanded mode) -->
        {#if popularExpanded}
          <div class="flex justify-center mt-6">
            <LoadMoreButton
              loading={loadingPopular}
              disabled={loadingPopular}
              preloader={popularGamesPreloader}
              on:load={loadMorePopular}
            />
          </div>
        {/if}
      {:else}
        <div class="text-center py-8 text-gray-400">
          <p>No popular games available</p>
        </div>
      {/if}
    </section>
    {:else}
    <!-- Popular Games Skeleton -->
    <section class="mb-10">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-4xl font-bold text-white">Popular Games</h2>
      </div>
      <div class="responsive-grid gap-3 sm:gap-4 xl:gap-6 {$sidebarCollapsed ? 'sidebar-collapsed' : ''}">
        {#each Array(8) as _, i}
          <SkeletonLoader variant="card" rounded="lg" />
        {/each}
      </div>
    </section>
    {/if}
    
    <!-- Genres Section -->
    {#if genres.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by Genre</h2>
          <a 
            href="/genres" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {#each genres.slice(0, 12) as genre}
            <a
              href="/genre/{encodeURIComponent(genre.name)}"
              class="bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg p-4 text-white hover:from-blue-700 hover:to-purple-800 transition-all duration-200 transform hover:scale-105"
            >
              <div class="text-center">
                <div class="text-lg font-semibold mb-1">{genre.name}</div>
                <div class="text-sm opacity-80">{genre.count} games</div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    <!-- Publishers Section -->
    {#if publishers.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by Publisher</h2>
          <a 
            href="/publishers" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {#each publishers.slice(0, 8) as publisher}
            <a
              href="/publisher/{encodeURIComponent(publisher.name)}"
              class="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all duration-200"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-white font-medium">{publisher.name}</div>
                  <div class="text-sm text-gray-400">{publisher.count} games</div>
                </div>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    <!-- Systems Section -->
    {#if systems.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Browse by System</h2>
          <a 
            href="/systems" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            View All
          </a>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {#each systems.slice(0, 12) as system}
            <a
              href="/system/{encodeURIComponent(system.name)}"
              class="bg-gradient-to-br from-green-600 to-teal-700 rounded-lg p-4 text-white hover:from-green-700 hover:to-teal-800 transition-all duration-200 transform hover:scale-105"
            >
              <div class="text-center">
                <div class="text-lg font-semibold mb-1">{system.name}</div>
                <div class="text-sm opacity-80">{system.count} games</div>
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
    
    
    <!-- Recent Requests (Admin Only) -->
    {#if user && user.hasPermission && (user.hasPermission('admin.panel') || user.hasPermission('request.view_all')) && recentRequests.length > 0}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-white">Recent Requests</h2>
          <a 
            href="/admin" 
            class="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Admin Panel
          </a>
        </div>
        
        <div class="space-y-3">
          {#each recentRequests.slice(0, 5) as request}
            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <h3 class="font-medium text-white text-sm">
                    {request.title}
                  </h3>
                  <p class="text-xs text-gray-400 mt-1">
                    Requested by {request.user_name || 'Anonymous'} • {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div class="ml-4">
                  <StatusBadge status={request.status} />
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>


<!-- Game Modal - Lazy Loaded -->
{#if GameModal && modalOpen}
  <svelte:component 
    this={GameModal}
    game={modalGame}
    isOpen={modalOpen}
    on:close={handleCloseModal}
    on:request={handleModalRequest}
    on:watchlist={handleModalWatchlist}
    on:view-details={handleModalViewDetails}
  />
{/if}

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

  /* Responsive grid with dynamic columns - much smaller max to prevent oversized covers */
  .responsive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 200px));
    width: 100%;
    justify-content: center;
  }

  /* Responsive breakpoints with much smaller max widths */
  /* Very small mobile devices */
  @media (max-width: 416px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    }
  }

  @media (min-width: 417px) and (max-width: 640px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(150px, 170px));
    }
  }

  @media (min-width: 640px) and (max-width: 768px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(140px, 180px));
    }
  }

  @media (min-width: 768px) and (max-width: 1024px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 190px));
    }
  }

  @media (min-width: 1024px) and (max-width: 1536px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 200px));
    }
  }

  @media (min-width: 1536px) and (max-width: 2048px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(200px, 220px));
    }
  }

  @media (min-width: 2048px) {
    .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 240px));
    }
  }

  /* Sidebar collapsed optimizations - very compact max widths */
  .sidebar-collapsed .responsive-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 180px));
  }

  .sidebar-collapsed .responsive-grid {
    @media (max-width: 640px) {
      grid-template-columns: repeat(auto-fit, minmax(140px, 160px));
    }
  }

  .sidebar-collapsed .responsive-grid {
    @media (min-width: 640px) and (max-width: 768px) {
      grid-template-columns: repeat(auto-fit, minmax(130px, 170px));
    }
  }

  .sidebar-collapsed .responsive-grid {
    @media (min-width: 768px) and (max-width: 1024px) {
      grid-template-columns: repeat(auto-fit, minmax(150px, 180px));
    }
  }

  .sidebar-collapsed .responsive-grid {
    @media (min-width: 1024px) and (max-width: 1536px) {
      grid-template-columns: repeat(auto-fit, minmax(160px, 180px));
    }
  }

  .sidebar-collapsed .responsive-grid {
    @media (min-width: 1536px) and (max-width: 2048px) {
      grid-template-columns: repeat(auto-fit, minmax(180px, 200px));
    }
  }

  .sidebar-collapsed .responsive-grid {
    @media (min-width: 2048px) {
      grid-template-columns: repeat(auto-fit, minmax(200px, 220px));
    }
  }

  /* Dynamic card size using CSS custom properties - high specificity to override other rules */
  .dynamic-card-size .responsive-grid {
    grid-template-columns: repeat(auto-fit, minmax(var(--card-min-size), var(--card-max-size))) !important;
  }

  /* Responsive adjustments for dynamic card sizes */
  @media (max-width: 640px) {
    .dynamic-card-size .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(var(--card-min-size-mobile), var(--card-max-size-mobile))) !important;
    }
  }

  /* Override sidebar collapsed styles when using dynamic sizing */
  .dynamic-card-size.sidebar-collapsed .responsive-grid {
    grid-template-columns: repeat(auto-fit, minmax(var(--card-min-size), var(--card-max-size))) !important;
  }

  @media (max-width: 640px) {
    .dynamic-card-size.sidebar-collapsed .responsive-grid {
      grid-template-columns: repeat(auto-fit, minmax(var(--card-min-size-mobile), var(--card-max-size-mobile))) !important;
    }
  }

  /* Custom range slider styles */
  .slider {
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .slider::-webkit-slider-thumb:hover {
    background: #2563eb;
    transform: scale(1.1);
  }

  .slider::-webkit-slider-track {
    background: #374151;
    border-radius: 5px;
    height: 8px;
  }

  .slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .slider::-moz-range-thumb:hover {
    background: #2563eb;
    transform: scale(1.1);
  }

  .slider::-moz-range-track {
    background: #374151;
    border-radius: 5px;
    height: 8px;
    border: none;
  }
</style>