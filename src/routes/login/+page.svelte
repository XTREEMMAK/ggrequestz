<!-- Enhanced Login Page with Dynamic Vanta.js Integration -->

<script>
  import { browser } from '$app/environment';
  import { loadVantaWaves } from '$lib/utils/scriptLoader.js';
  import { onMount } from 'svelte';
  
  // Minimal props only
  let { data } = $props();
  
  // Reactive state for fade-in animation
  let vantaLoaded = $state(false);
  let vantaError = $state(false);
  let vantaNode = $state(null);
  let vantaEffect = $state(null);
  
  // Initialize Vanta after scripts are loaded
  async function initializeVanta(node) {
    if (!node || !window.VANTA || !window.VANTA.WAVES) {
      return;
    }
    
    const effect = window.VANTA.WAVES({
      el: node,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.00,
      minWidth: 200.00,
      scale: 1.00,
      scaleMobile: 1.00,
      color: 0x1e3a8a,
      shininess: 40,
      waveHeight: 15,
      waveSpeed: 1.0,
      zoom: 0.8
    });
    
    if (effect) {
      vantaEffect = effect;
      
      // Force resize after initialization
      setTimeout(() => {
        if (effect.resize) {
          effect.resize();
        }
      }, 100);
    }
  }
  
  // Load Vanta.js scripts on mount
  onMount(async () => {
    if (browser) {
      try {
        await loadVantaWaves();
        vantaLoaded = true;
        
        // Initialize Vanta if node is ready
        if (vantaNode) {
          await initializeVanta(vantaNode);
        }
      } catch (error) {
        // Silently handle Vanta.js loading errors
        vantaError = true;
      }
    }
    
    // Cleanup on component destroy
    return () => {
      if (vantaEffect) {
        vantaEffect.destroy();
        vantaEffect = null;
      }
    };
  });
  
  // Simplified Vanta.js action that just stores the node reference
  function vantaWaves(node) {
    vantaNode = node;
    
    // If scripts are already loaded, initialize immediately
    if (vantaLoaded && !vantaEffect) {
      initializeVanta(node);
    }
    
    return {
      destroy() {
        // Cleanup handled in onMount return
      }
    };
  }
</script>

<svelte:head>
  <title>Login - G.G Requestz</title>
  <meta name="description" content="Login to G.G Requestz - Game Discovery & Request Platform" />
</svelte:head>

<!-- Vanta.js Background Container with Fade-in -->
<div 
  use:vantaWaves 
  class="vanta-layer" 
  class:vanta-loaded={vantaLoaded}
  class:vanta-error={vantaError}
></div>

<!-- Standard Background (fallback) -->
<div class="simple-bg"></div>


<!-- Content Layer -->
<div class="content-container">
  <div class="w-full max-w-md">
      
      <!-- Login card -->
      <div class="glass-card">
        <!-- Logo and Title -->
        <div class="text-center mb-8">
          <div class="logo-container">
            <img 
              src="/GGR_Logo.webp" 
              alt="GameRequest Logo" 
              class="w-full h-full object-contain"
            />
          </div>
          <h1 class="gradient-text">G.G Requestz</h1>
          <p class="text-blue-100/80 text-sm">Game Discovery & Request Platform</p>
        </div>
        
        <!-- Login Options -->
        <div class="space-y-4">
          <!-- Authentik Button -->
          {#if data?.isAuthentikEnabled}
          <a
            href="/api/auth/login"
            class="auth-button primary-button"
            style="text-decoration: none;"
          >
            <svg class="key-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/>
              <path d="m21 2-9.6 9.6"/>
              <circle cx="7.5" cy="15.5" r="5.5"/>
            </svg>
            <span>Login with Authentik</span>
          </a>
          {/if}
          
          <!-- Basic Auth Button -->
          {#if data?.isBasicAuthEnabled}
          <a
            href="/login/basic"
            class="auth-button secondary-button"
            style="text-decoration: none;"
          >
            <svg class="user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Login with Username/Password
          </a>
          {/if}

          <!-- Registration Button -->
          {#if data?.isBasicAuthEnabled && data?.registrationEnabled}
          <a
            href="/register"
            class="auth-button register-button"
            style="text-decoration: none;"
          >
            <svg class="user-plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Create New Account
          </a>
          {/if}

          <!-- Error Message -->
          {#if !data?.isAuthentikEnabled && !data?.isBasicAuthEnabled}
          <div class="error-card">
            <svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <path d="M12 9v4"/>
              <path d="m12 17 .01 0"/>
            </svg>
            <p class="text-sm">No authentication methods are configured.</p>
          </div>
          {/if}
        </div>
        
        <!-- Footer -->
        <div class="mt-8 text-center">
          <p class="text-xs text-blue-100/60">
            Secure authentication powered by industry-standard protocols
          </p>
        </div>
      </div>
    </div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }
  
  /* Dedicated Vanta.js Layer with Fade-in Animation */
  .vanta-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 2s ease-in-out;
    /* Blend mode for visual enhancement */
    mix-blend-mode: overlay;
  }
  
  .vanta-layer.vanta-loaded {
    opacity: 1;
  }
  
  .vanta-layer.vanta-error {
    opacity: 0;
    display: none;
  }
  
  /* Enhanced Background with Smooth Blend Mode Support */
  .simple-bg {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 0;
    /* Use pseudo-elements for smooth gradient transitions */
    background: linear-gradient(149deg,rgba(34, 193, 195, 1) 0%, rgba(253, 187, 45, 1) 100%);
    /* Fade in the base gradient */
    opacity: 0;
    animation: baseFadeIn 3s ease-out forwards;
  }
  
  @keyframes baseFadeIn {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  
  .simple-bg::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(320deg,rgba(153, 26, 21, 1) 0%, rgba(87, 199, 133, 1) 22%, rgba(237, 83, 234, 1) 100%);
    opacity: 0;
    transition: opacity 8s ease-in-out;
    animation: gradientFade 24s ease-in-out infinite 2s;
  }
  
  .simple-bg::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, 
      #10b981 0%,
      #5b21b6 25%, 
      #0f766e 50%, 
      #312e81 75%, 
      #1e3a8a 100%
    );
    opacity: 0;
    transition: opacity 8s ease-in-out;
    animation: gradientFade 32s ease-in-out infinite 10s;
  }
  
  /* Add a fourth gradient layer for the complex teal-to-purple effect */
  .simple-bg {
    position: relative;
  }
  
  .simple-bg:before {
    z-index: 1;
  }
  
  .simple-bg:after {
    z-index: 1;
  }
  
  /* Create the complex gradient using a pseudo-element on the parent */
  .content-container::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    background: radial-gradient(ellipse at center, 
      rgba(6, 182, 212, 0.9) 0%,
      rgba(16, 185, 129, 0.8) 20%,
      rgba(59, 130, 246, 0.7) 40%,
      rgba(147, 51, 234, 0.8) 70%,
      rgba(30, 58, 138, 0.9) 100%
    );
    opacity: 0;
    transition: opacity 10s ease-in-out;
    animation: complexGradientFade 32s ease-in-out infinite 18s;
    pointer-events: none;
    /* Add blend mode for better visual mixing */
    mix-blend-mode: multiply;
  }
  
  @keyframes gradientFade {
    0%, 31.25%, 100% { 
      opacity: 0; 
    }
    15.625% { 
      opacity: 0.7; 
    }
  }
  
  @keyframes complexGradientFade {
    0%, 31.25%, 100% { 
      opacity: 0; 
    }
    15.625% { 
      opacity: 0.6; 
    }
  }
  
  /* Content Layer - Above everything */
  .content-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 100;
    pointer-events: none;
  }
  
  /* Allow interactions with the login card */
  .glass-card {
    pointer-events: auto;
  }
  
  /* Lighter glass card with improved styling */
  .glass-card {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.3) 0%, rgba(51, 65, 85, 0.4) 50%, rgba(71, 85, 105, 0.2) 100%);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 20px;
    padding: 2rem;
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(148, 163, 184, 0.2),
      0 0 0 1px rgba(51, 65, 85, 0.3);
    transition: all 0.3s ease;
    position: relative;
    z-index: 5;
  }
  
  .glass-card:hover {
    transform: translateY(-5px);
    box-shadow: 
      0 20px 40px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(148, 163, 184, 0.3),
      0 0 0 1px rgba(71, 85, 105, 0.4);
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(51, 65, 85, 0.7) 50%, rgba(71, 85, 105, 0.5) 100%);
  }
  
  /* Logo container with enhanced styling */
  .logo-container {
    width: 6rem;
    height: 6rem;
    margin: 0 auto 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(147, 197, 253, 0.3) 0%, rgba(59, 130, 246, 0.2) 100%);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    transition: transform 0.3s ease;
    border: 2px solid rgba(147, 197, 253, 0.4);
  }
  
  .logo-container:hover {
    transform: scale(1.05) rotate(5deg);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }
  
  /* Simple clean text */
  .gradient-text {
    font-size: 1.875rem;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 0.5rem;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }
  
  /* Enhanced button styling */
  .auth-button {
    width: 100%;
    font-weight: 600;
    padding: 1rem 1.5rem;
    border-radius: 15px;
    transition: all 0.3s ease;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    position: relative;
    overflow: hidden;
    font-size: 1rem;
  }
  
  .auth-button::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%);
    transform: translateX(-100%);
    transition: transform 0.6s ease;
  }
  
  .auth-button:hover::before {
    transform: translateX(100%);
  }
  
  .primary-button {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
    color: white;
    box-shadow: 0 8px 25px rgba(37, 99, 235, 0.4);
    border: 1px solid rgba(147, 197, 253, 0.3);
  }
  
  .primary-button:hover {
    transform: translateY(-3px);
    box-shadow: 0 15px 35px rgba(37, 99, 235, 0.6);
    background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%);
  }
  
  .primary-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .secondary-button {
    background: linear-gradient(135deg, #475569 0%, #334155 100%);
    color: #e2e8f0;
    box-shadow: 0 8px 25px rgba(71, 85, 105, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.3);
  }
  
  .secondary-button:hover {
    transform: translateY(-3px);
    box-shadow: 0 15px 35px rgba(71, 85, 105, 0.6);
    background: linear-gradient(135deg, #64748b 0%, #475569 100%);
  }

  .register-button {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    color: white;
    box-shadow: 0 8px 25px rgba(5, 150, 105, 0.4);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .register-button:hover {
    transform: translateY(-3px);
    box-shadow: 0 15px 35px rgba(5, 150, 105, 0.6);
    background: linear-gradient(135deg, #047857 0%, #065f46 100%);
  }

  /* Icon styling with proper spacing */
  .key-icon, .user-icon, .user-plus-icon {
    width: 1.5rem;
    height: 1.5rem;
    transition: transform 0.3s ease;
    flex-shrink: 0;
  }
  
  .auth-button:hover .key-icon,
  .auth-button:hover .user-icon,
  .auth-button:hover .user-plus-icon {
    transform: scale(1.1) rotate(5deg);
  }
  
  .warning-icon {
    width: 1.5rem;
    height: 1.5rem;
    margin: 0 auto 0.5rem;
    color: #fbbf24;
  }
  
  .error-card {
    text-align: center;
    color: #fecaca;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.1) 100%);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 15px;
    padding: 1rem;
    backdrop-filter: blur(10px);
  }
  
  /* Utility classes */
  .space-y-4 > * + * { margin-top: 1rem; }
  .text-center { text-align: center; }
  .mb-8 { margin-bottom: 2rem; }
  .mt-8 { margin-top: 2rem; }
  .text-sm { font-size: 0.875rem; }
  .text-xs { font-size: 0.75rem; }
  .text-blue-100\/80 { color: rgba(219, 234, 254, 0.9); }
  .text-blue-100\/60 { color: rgba(219, 234, 254, 0.8); }
  .w-full { width: 100%; }
  .h-full { height: 100%; }
  .object-contain { object-fit: contain; }
  .max-w-md { max-width: 28rem; }
  
  
  
</style>