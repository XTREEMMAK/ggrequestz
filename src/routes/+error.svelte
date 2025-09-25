<!--
  Custom error page with gaming theme and security monitoring
-->

<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import { browser } from '$app/environment';

  let { data } = $props();

  // Get error details
  let error = $derived($page.error || {});
  let status = $derived($page.status || 500);
  let message = $derived(error.message || 'Something went wrong');

  // 404 attempt tracking (pure client-side)
  let is404 = $derived(status === 404);
  let showWarning = $state(false);
  let securitySettings = $state({
    enabled: true,
    maxAttempts: 5,
    timeWindow: 300, // 5 minutes in seconds
    logoutUser: true,
    notifyAdmin: true
  });

  // Load admin settings from server data or defaults
  async function loadSecuritySettings() {
    try {
      // Try to get security settings from parent data
      // The admin settings are loaded in the root layout and available in page stores
      // For now, use localStorage cache if available, otherwise use defaults
      const cached = localStorage.getItem('ggr_security_settings');
      if (cached) {
        try {
          securitySettings = JSON.parse(cached);
          return;
        } catch (e) {
          // Invalid JSON, remove and use defaults
          localStorage.removeItem('ggr_security_settings');
        }
      }

      // Try to fetch from server-side data (will need to be added to error layout)
      // For now, keep the default settings
    } catch (err) {
      console.warn('Failed to load security settings, using defaults:', err);
    }
  }

  // Track 404 attempt with client-side enforcement
  async function track404Attempt() {
    if (!securitySettings.enabled) return;

    const now = Date.now();
    const attemptKey = 'ggr_404_attempts';
    const warningKey = 'ggr_404_warning_shown';

    // Get existing tracking data
    let trackingData = {};
    try {
      const existing = localStorage.getItem(attemptKey);
      if (existing) {
        trackingData = JSON.parse(existing);
      }
    } catch (err) {
      trackingData = {};
    }

    // Initialize tracking data
    if (!trackingData.firstAttempt) {
      trackingData = {
        count: 0,
        firstAttempt: now,
        lastAttempt: now,
        paths: [],
        warned: false
      };
    }

    // Clean old attempts outside time window
    const timeWindow = securitySettings.timeWindow * 1000; // Convert to milliseconds
    if (now - trackingData.firstAttempt > timeWindow) {
      // Reset tracking window
      trackingData = {
        count: 0,
        firstAttempt: now,
        lastAttempt: now,
        paths: [],
        warned: false
      };
      localStorage.removeItem(warningKey);
    }

    // Update tracking
    trackingData.count++;
    trackingData.lastAttempt = now;
    trackingData.paths.push($page.url.pathname);

    // Keep only unique paths and limit to last 10
    trackingData.paths = [...new Set(trackingData.paths)].slice(-10);

    // Save tracking data
    localStorage.setItem(attemptKey, JSON.stringify(trackingData));

    // Show warning after 3 attempts (client-side only)
    if (trackingData.count >= 3) {
      showWarning = true;
    }

    // Check if user exceeded limits
    if (trackingData.count >= securitySettings.maxAttempts) {
      // Note: Admin notifications are now handled server-side
      // This client-side approach focuses on user enforcement only
      if (!trackingData.warned) {
        trackingData.warned = true;
        localStorage.setItem(attemptKey, JSON.stringify(trackingData));
      }

      // Handle logout for authenticated users
      if (securitySettings.logoutUser) {
        try {
          // Call logout API
          await fetch('/api/security/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'excessive_404_attempts' })
          });

          // Clear client-side tracking
          localStorage.removeItem(attemptKey);
          localStorage.removeItem(warningKey);
          sessionStorage.clear();

          // Redirect to login with message
          window.location.href = '/login?message=security_violation';
          return;
        } catch (err) {
          console.warn('Security logout failed:', err);
          // Still redirect even if API fails
          window.location.href = '/login?message=security_violation';
          return;
        }
      }
    }
  }

  onMount(async () => {
    if (is404 && browser) {
      // Load security settings first
      await loadSecuritySettings();

      // Then track the attempt
      await track404Attempt();
    }
  });

  // Get appropriate error message and icon
  let errorInfo = $derived(() => {
    switch (status) {
      case 404:
        return {
          title: 'Game Not Found',
          subtitle: 'Level 404: Area Unexplored',
          message: "The page you're looking for has respawned elsewhere or never existed in this dimension.",
          icon: 'heroicons:map',
          suggestions: [
            { text: 'Return to Home Base', action: () => goto('/'), icon: 'heroicons:home' },
            { text: 'Browse Game Library', action: () => goto('/browse'), icon: 'heroicons:squares-plus' },
            { text: 'Search for Games', action: () => goto('/search'), icon: 'heroicons:magnifying-glass' },
            { text: 'Check Game Requests', action: () => goto('/requests'), icon: 'heroicons:clipboard-document-list' }
          ]
        };
      case 403:
        return {
          title: 'Access Denied',
          subtitle: 'Level Locked',
          message: "You don't have the required permissions to access this area.",
          icon: 'heroicons:lock-closed',
          suggestions: [
            { text: 'Return Home', action: () => goto('/'), icon: 'heroicons:home' },
            { text: 'Login/Register', action: () => goto('/login'), icon: 'heroicons:user-circle' }
          ]
        };
      case 500:
        return {
          title: 'Server Error',
          subtitle: 'System Crash Detected',
          message: "The server encountered an unexpected error. Our engineers are working on it!",
          icon: 'heroicons:exclamation-triangle',
          suggestions: [
            { text: 'Try Again', action: () => location.reload(), icon: 'heroicons:arrow-path' },
            { text: 'Return Home', action: () => goto('/'), icon: 'heroicons:home' }
          ]
        };
      default:
        return {
          title: `Error ${status}`,
          subtitle: 'Unexpected Error',
          message: message || 'Something went wrong',
          icon: 'heroicons:exclamation-circle',
          suggestions: [
            { text: 'Return Home', action: () => goto('/'), icon: 'heroicons:home' }
          ]
        };
    }
  });
</script>

<svelte:head>
  <title>Error {status} - GGRequestz</title>
  <meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="error-container">
  <!-- Background Animation -->
  <div class="floating-elements">
    <div class="floating-icon">🎮</div>
    <div class="floating-icon">🎯</div>
    <div class="floating-icon">⚡</div>
    <div class="floating-icon">🌟</div>
    <div class="floating-icon">🔥</div>
    <div class="floating-icon">💫</div>
  </div>

  <!-- Main Error Content -->
  <div class="error-content">
    <!-- Status Code Display -->
    <div class="status-display">
      <div class="glitch-text" data-text="{status}">
        {status}
      </div>
    </div>

    <!-- Error Icon -->
    <div class="error-icon">
      <Icon icon={errorInfo.icon} class="icon-large" />
    </div>

    <!-- Error Details -->
    <div class="error-details">
      <h1 class="error-title">{errorInfo.title}</h1>
      <h2 class="error-subtitle">{errorInfo.subtitle}</h2>
      <p class="error-message">{errorInfo.message}</p>
    </div>

    <!-- 404 Security Warning -->
    {#if is404 && showWarning}
      <div class="security-warning" role="alert">
        <Icon icon="heroicons:shield-exclamation" class="warning-icon" />
        <div class="warning-content">
          <h3>Security Notice</h3>
          <p>
            Multiple failed page attempts detected in this session.
            Continued attempts may result in temporary access restrictions.
          </p>
        </div>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="action-buttons">
      {#each errorInfo.suggestions as suggestion}
        <button
          class="action-btn"
          onclick={suggestion.action}
        >
          <Icon icon={suggestion.icon} />
          <span>{suggestion.text}</span>
        </button>
      {/each}
    </div>

    <!-- Additional Help -->
    <div class="help-section">
      <details class="help-details">
        <summary>Need more help?</summary>
        <div class="help-content">
          <p>If you continue experiencing issues:</p>
          <ul>
            <li>Check if the URL is typed correctly</li>
            <li>Try refreshing the page</li>
            <li>Clear your browser cache</li>
            <li>Contact an administrator if the problem persists</li>
          </ul>
          <p class="error-id">Error ID: {crypto.randomUUID().slice(0, 8)}</p>
        </div>
      </details>
    </div>
  </div>
</div>

<style>
  .error-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    padding: 1rem;
    z-index: 9999;
  }

  .floating-elements {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .floating-icon {
    position: absolute;
    font-size: 2rem;
    opacity: 0.1;
    animation: float 6s ease-in-out infinite;
    user-select: none;
  }

  .floating-icon:nth-child(1) { top: 20%; left: 10%; animation-delay: 0s; }
  .floating-icon:nth-child(2) { top: 60%; left: 20%; animation-delay: 2s; }
  .floating-icon:nth-child(3) { top: 30%; right: 15%; animation-delay: 4s; }
  .floating-icon:nth-child(4) { top: 70%; right: 10%; animation-delay: 1s; }
  .floating-icon:nth-child(5) { top: 10%; left: 50%; animation-delay: 3s; }
  .floating-icon:nth-child(6) { top: 80%; left: 60%; animation-delay: 5s; }

  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    33% { transform: translateY(-20px) rotate(120deg); }
    66% { transform: translateY(10px) rotate(240deg); }
  }

  .error-content {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 3rem;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);
    text-align: center;
    max-width: 600px;
    width: 100%;
    z-index: 2;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .status-display {
    margin-bottom: 2rem;
  }

  .glitch-text {
    font-size: 6rem;
    font-weight: bold;
    background: linear-gradient(45deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    position: relative;
    display: inline-block;
  }

  .glitch-text::before,
  .glitch-text::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .glitch-text::before {
    animation: glitch-1 2s infinite;
    color: #ff6b6b;
    z-index: -1;
  }

  .glitch-text::after {
    animation: glitch-2 2s infinite;
    color: #4ecdc4;
    z-index: -2;
  }

  @keyframes glitch-1 {
    0%, 100% { transform: translate(0); }
    20% { transform: translate(-2px, 2px); }
    40% { transform: translate(-2px, -2px); }
    60% { transform: translate(2px, 2px); }
    80% { transform: translate(2px, -2px); }
  }

  @keyframes glitch-2 {
    0%, 100% { transform: translate(0); }
    20% { transform: translate(2px, 2px); }
    40% { transform: translate(2px, -2px); }
    60% { transform: translate(-2px, 2px); }
    80% { transform: translate(-2px, -2px); }
  }

  .error-icon {
    margin-bottom: 2rem;
  }

  :global(.icon-large) {
    width: 4rem;
    height: 4rem;
    color: #667eea;
  }

  .error-details {
    margin-bottom: 2rem;
  }

  .error-title {
    font-size: 2.5rem;
    font-weight: bold;
    color: #2d3748;
    margin-bottom: 0.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
  }

  .error-subtitle {
    font-size: 1.5rem;
    color: #667eea;
    margin-bottom: 1rem;
    font-weight: 600;
  }

  .error-message {
    font-size: 1.1rem;
    color: #4a5568;
    line-height: 1.6;
    max-width: 500px;
    margin: 0 auto;
  }

  .security-warning {
    background: linear-gradient(45deg, #fed7d7, #fbb6ce);
    border: 2px solid #e53e3e;
    border-radius: 12px;
    padding: 1.5rem;
    margin: 2rem 0;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    animation: pulse-warning 2s infinite;
  }

  @keyframes pulse-warning {
    0%, 100% { box-shadow: 0 0 0 0 rgba(229, 62, 62, 0.4); }
    50% { box-shadow: 0 0 0 10px rgba(229, 62, 62, 0); }
  }

  :global(.warning-icon) {
    width: 2rem;
    height: 2rem;
    color: #e53e3e;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  .warning-content h3 {
    color: #c53030;
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  .warning-content p {
    color: #742a2a;
    margin: 0;
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: linear-gradient(45deg, #667eea, #764ba2);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    text-decoration: none;
  }

  .action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .help-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #e2e8f0;
  }

  .help-details {
    text-align: left;
  }

  .help-details summary {
    color: #667eea;
    font-weight: 600;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 8px;
    transition: background-color 0.2s ease;
    text-align: center;
  }

  .help-details summary:hover {
    background-color: rgba(102, 126, 234, 0.1);
  }

  .help-content {
    padding: 1rem;
    margin-top: 1rem;
    background-color: rgba(102, 126, 234, 0.05);
    border-radius: 8px;
    border-left: 4px solid #667eea;
  }

  .help-content ul {
    margin: 1rem 0;
    padding-left: 1.5rem;
  }

  .help-content li {
    margin-bottom: 0.5rem;
    color: #4a5568;
  }

  .error-id {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    color: #718096;
    margin-top: 1rem;
    text-align: center;
  }

  /* Responsive Design */
  @media (max-width: 640px) {
    .error-content {
      padding: 2rem 1.5rem;
      margin: 1rem;
    }

    .glitch-text {
      font-size: 4rem;
    }

    .error-title {
      font-size: 2rem;
    }

    .error-subtitle {
      font-size: 1.25rem;
    }

    .action-buttons {
      flex-direction: column;
      align-items: center;
    }

    .action-btn {
      min-width: 200px;
      justify-content: center;
    }

    .floating-icon {
      font-size: 1.5rem;
    }
  }
</style>