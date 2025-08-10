<!--
  Platform icons component with direct store links only (no search fallbacks)
-->

<script>
  import Icon from '@iconify/svelte';
  
  let { platforms = [], game = {}, size = 'md', maxVisible = 4, showLinks = true } = $props();
  
  let sizeClass = $derived(getSizeClass(size));
  
  // Deduplicate platforms and create unique platform data
  let uniquePlatforms = $derived.by(() => {
    const seen = new Set();
    const unique = [];
    
    for (const platform of platforms) {
      const platformData = getPlatformData(platform);
      const key = `${platformData.type}-${platformData.name}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          original: platform,
          data: platformData
        });
      }
    }
    
    return unique;
  });
  
  let visiblePlatforms = $derived(uniquePlatforms.slice(0, maxVisible));
  let hiddenCount = $derived(Math.max(0, uniquePlatforms.length - maxVisible));
  
  function getSizeClass(size) {
    const sizeMap = {
      'xs': 'w-4 h-4',
      'sm': 'w-5 h-5',
      'md': 'w-6 h-6',
      'lg': 'w-8 h-8',
      'xl': 'w-10 h-10',
      '2xl': 'w-12 h-12'
    };
    
    return sizeMap[size] || sizeMap.md;
  }
  
  function getNintendoSizeClass(size) {
    // Nintendo icons get larger sizes for better visibility
    const nintendoSizeMap = {
      'xs': 'w-5 h-5',
      'sm': 'w-6 h-6',
      'md': 'w-8 h-8',
      'lg': 'w-10 h-10',
      'xl': 'w-12 h-12',
      '2xl': 'w-14 h-14'
    };
    
    return nintendoSizeMap[size] || nintendoSizeMap.md;
  }
  
  // Clean platform detection with direct IGDB URL support
  function getPlatformData(platform) {
    const normalized = platform.toLowerCase();
    
    // Check if we have direct IGDB website URLs
    const hasDirectUrls = game?.websites && Object.keys(game.websites).length > 0;
    
    // Detect platform type and get appropriate data
    if (hasDirectUrls && game.websites.steam && normalized.includes('pc')) {
      // PC platform with Steam URL - show Steam instead of generic PC
      return {
        type: 'steam',
        icon: 'simple-icons:steam',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'Steam',
        url: game.websites.steam
      };
    } else if (normalized.includes('steam')) {
      return {
        type: 'steam',
        icon: 'simple-icons:steam',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'Steam',
        url: hasDirectUrls ? game.websites.steam : null
      };
    } else if (normalized.includes('epic')) {
      return {
        type: 'epic',
        icon: 'simple-icons:epicgames',
        color: 'text-gray-800 hover:text-gray-900',
        name: 'Epic Games Store',
        url: hasDirectUrls ? game.websites.epic : null
      };
    } else if (normalized.includes('gog')) {
      return {
        type: 'gog',
        icon: 'simple-icons:gog-dot-com',
        color: 'text-purple-600 hover:text-purple-700',
        name: 'GOG',
        url: hasDirectUrls ? game.websites.gog : null
      };
    } else if (normalized.includes('playstation vita') || normalized.includes('ps vita')) {
      return {
        type: 'playstation-vita',
        icon: 'simple-icons:playstationvita',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'PlayStation Vita',
        url: null
      };
    } else if (normalized.includes('psp') || normalized.includes('playstation portable')) {
      return {
        type: 'psp',
        icon: 'simple-icons:playstationportable',
        color: 'text-gray-700 hover:text-gray-800',
        name: 'PlayStation Portable',
        url: null
      };
    } else if (normalized.includes('playstation 4') || normalized.includes('ps4')) {
      return {
        type: 'playstation-4',
        icon: 'simple-icons:playstation4',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'PlayStation 4',
        url: null
      };
    } else if (normalized.includes('playstation 3') || normalized.includes('ps3')) {
      return {
        type: 'playstation-3',
        icon: 'simple-icons:playstation3',
        color: 'text-gray-700 hover:text-gray-800',
        name: 'PlayStation 3',
        url: null
      };
    } else if (normalized.includes('playstation 2') || normalized.includes('ps2')) {
      return {
        type: 'playstation-2',
        icon: 'simple-icons:playstation2',
        color: 'text-blue-700 hover:text-blue-800',
        name: 'PlayStation 2',
        url: null
      };
    } else if (normalized.includes('playstation 1') || normalized.includes('ps1') || (normalized.includes('playstation') && !normalized.includes('ps'))) {
      return {
        type: 'playstation-1',
        icon: 'fontisto:playstation',
        color: 'text-gray-600 hover:text-gray-700',
        name: 'PlayStation',
        url: null
      };
    } else if (normalized.includes('playstation') || normalized.includes('ps')) {
      return {
        type: 'playstation',
        icon: 'simple-icons:playstation',
        color: 'text-blue-700 hover:text-blue-800',
        name: 'PlayStation',
        url: null
      };
    } else if (normalized.includes('xbox')) {
      return {
        type: 'xbox',
        icon: 'simple-icons:xbox',
        color: 'text-green-600 hover:text-green-700',
        name: 'Xbox',
        url: null // Xbox URLs not typically in IGDB websites
      };
    } else if (normalized.includes('switch')) {
      return {
        type: 'nintendo-switch',
        icon: 'simple-icons:nintendoswitch',
        color: 'text-red-600 hover:text-red-700',
        name: 'Nintendo Switch',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('3ds')) {
      return {
        type: 'nintendo-3ds',
        icon: 'simple-icons:nintendo3ds', 
        color: 'text-red-600 hover:text-red-700',
        name: 'Nintendo 3DS',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('wii')) {
      return {
        type: 'nintendo-wii',
        icon: 'simple-icons:wii',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'Nintendo Wii',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('game boy advance') || normalized.includes('gba')) {
      return {
        type: 'gameboy-advance',
        icon: 'streamline-cyber-color:gameboy',
        color: 'text-purple-600 hover:text-purple-700',
        name: 'Game Boy Advance',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('game boy') || normalized.includes('gameboy')) {
      return {
        type: 'gameboy',
        icon: 'streamline-cyber:gameboy',
        color: 'text-gray-600 hover:text-gray-700',
        name: 'Game Boy',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('nes') && !normalized.includes('genesis')) {
      return {
        type: 'nes',
        icon: 'cbi:nes-console',
        color: 'text-red-600 hover:text-red-700',
        name: 'Nintendo NES',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('snes') || normalized.includes('super nintendo')) {
      return {
        type: 'snes',
        icon: 'teenyicons:snes-outline',
        color: 'text-purple-600 hover:text-purple-700',
        name: 'Super Nintendo',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('genesis') || normalized.includes('mega drive')) {
      return {
        type: 'genesis',
        icon: 'cbi:genesis-vgs',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'Sega Genesis',
        url: null
      };
    } else if (normalized.includes('sega cd') || normalized.includes('mega cd')) {
      return {
        type: 'sega-cd',
        icon: 'cbi:genesis-vgs',
        color: 'text-cyan-600 hover:text-cyan-700',
        name: 'Sega CD',
        url: null
      };
    } else if (normalized.includes('32x')) {
      return {
        type: '32x',
        icon: 'cbi:genesis-vgs',
        color: 'text-red-600 hover:text-red-700',
        name: 'Sega 32X',
        url: null
      };
    } else if (normalized.includes('saturn')) {
      return {
        type: 'saturn',
        icon: 'cbi:sega-saturn',
        color: 'text-purple-600 hover:text-purple-700',
        name: 'Sega Saturn',
        url: null
      };
    } else if (normalized.includes('dreamcast')) {
      return {
        type: 'dreamcast',
        icon: 'cbi:dreamcast',
        color: 'text-orange-600 hover:text-orange-700',
        name: 'Sega Dreamcast',
        url: null
      };
    } else if (normalized.includes('nintendo')) {
      return {
        type: 'nintendo-generic',
        icon: 'simple-icons:nintendo',
        color: 'text-red-600 hover:text-red-700',
        name: 'Nintendo',
        url: null,
        customSize: true
      };
    } else if (normalized.includes('android')) {
      return {
        type: 'android',
        icon: 'simple-icons:googleplay',
        color: 'text-green-600 hover:text-green-700',
        name: 'Google Play Store',
        url: hasDirectUrls ? game.websites.android : null
      };
    } else if (normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) {
      return {
        type: 'ios',
        icon: 'simple-icons:appstore',
        color: 'text-blue-600 hover:text-blue-700',
        name: 'App Store',
        url: hasDirectUrls ? game.websites.ios : null
      };
    } else if (normalized.includes('linux')) {
      return {
        type: 'linux',
        icon: 'simple-icons:linux',
        color: 'text-yellow-600 hover:text-yellow-700',
        name: 'Linux',
        url: null
      };
    } else if (normalized.includes('mac') || normalized.includes('macos')) {
      return {
        type: 'mac',
        icon: 'simple-icons:apple',
        color: 'text-gray-400 hover:text-gray-500',
        name: 'macOS',
        url: null
      };
    } else if (normalized.includes('pc')) {
      return {
        type: 'pc',
        icon: 'heroicons:computer-desktop',
        color: 'text-gray-600 hover:text-gray-700',
        name: 'PC',
        url: null
      };
    } else if (normalized.includes('mobile')) {
      return {
        type: 'mobile',
        icon: 'mdi:cellphone',
        color: 'text-orange-600 hover:text-orange-700',
        name: 'Mobile',
        url: null
      };
    } else {
      return {
        type: 'generic',
        icon: 'mdi:gamepad-variant',
        color: 'text-gray-500 hover:text-gray-600',
        name: platform,
        url: null
      };
    }
  }
  
  function handlePlatformClick(platformData, event) {
    if (!showLinks || !platformData.url) return;
    
    event.preventDefault();
    window.open(platformData.url, '_blank', 'noopener,noreferrer');
  }
</script>

{#if platforms.length > 0}
  <div class="flex items-center space-x-1" title={platforms.join(', ')}>
    {#each visiblePlatforms as platformItem}
      {@const platformData = platformItem.data}
      
      <div 
        class="platform-icon-wrapper {showLinks && platformData.url ? 'cursor-pointer' : 'cursor-default'}" 
        title="{platformData.name}{showLinks && platformData.url ? ' - Click to open store' : ''}"
        role={showLinks && platformData.url ? 'button' : 'img'}
        tabindex={showLinks && platformData.url ? 0 : undefined}
        aria-label="{platformData.name}{showLinks && platformData.url ? ' store link' : ''}"
        onclick={(e) => handlePlatformClick(platformData, e)}
        onkeydown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && showLinks && platformData.url) {
            e.preventDefault();
            handlePlatformClick(platformData, e);
          }
        }}
      >
        <Icon 
          icon={platformData.icon}
          class="platform-icon {platformData.customSize ? getNintendoSizeClass(size) : sizeClass} {platformData.color} transition-transform duration-200 ease-in-out"
        />
      </div>
    {/each}
    
    {#if hiddenCount > 0}
      <span class="text-xs text-gray-500 ml-1">+{hiddenCount}</span>
    {/if}
  </div>
{/if}

<style>
  .platform-icon-wrapper :global(.platform-icon) {
    transition: transform 0.2s ease-in-out;
  }
  
  .platform-icon-wrapper:hover :global(.platform-icon),
  .platform-icon-wrapper:focus :global(.platform-icon) {
    transform: scale(1.1) rotate(-5deg);
  }
  
  .platform-icon-wrapper {
    border-radius: 4px;
    padding: 2px;
    transition: background-color 0.2s ease-in-out;
  }
  
  .platform-icon-wrapper:hover,
  .platform-icon-wrapper:focus {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .platform-icon-wrapper:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
  
  @media (prefers-reduced-motion: reduce) {
    .platform-icon-wrapper :global(.platform-icon),
    .platform-icon-wrapper {
      transition: none;
    }
    
    .platform-icon-wrapper:hover :global(.platform-icon),
    .platform-icon-wrapper:focus :global(.platform-icon) {
      transform: none;
    }
  }
</style>