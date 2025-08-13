/**
 * Dynamic script loader utility for external CDN scripts
 * Handles loading and dependency management for client-side libraries
 */

/**
 * Load a script from a CDN with promise-based handling
 * @param {string} src - Script URL
 * @param {string} globalName - Global variable name to check for (optional)
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<void>}
 */
export function loadScript(src, globalName = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Check if script is already loaded
    if (globalName && window[globalName]) {
      resolve();
      return;
    }

    // Check if script is already loading/loaded
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }
      
      // Wait for existing script to load
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.loaded = 'false';
    
    const timeoutId = setTimeout(() => {
      reject(new Error(`Script loading timeout: ${src}`));
    }, timeout);

    script.onload = () => {
      clearTimeout(timeoutId);
      script.dataset.loaded = 'true';
      
      // If we're checking for a global, wait for it to be available
      if (globalName) {
        const checkGlobal = () => {
          if (window[globalName]) {
            resolve();
          } else {
            setTimeout(checkGlobal, 50);
          }
        };
        checkGlobal();
      } else {
        resolve();
      }
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.head.appendChild(script);
  });
}

/**
 * Load multiple scripts in sequence
 * @param {Array<{src: string, globalName?: string}>} scripts - Array of script configurations
 * @returns {Promise<void>}
 */
export async function loadScripts(scripts) {
  for (const script of scripts) {
    await loadScript(script.src, script.globalName);
  }
}

/**
 * Vanta.js specific loader with Three.js dependency
 * @returns {Promise<void>}
 */
export async function loadVantaWaves() {
  try {
    // Load Three.js first (r134 specifically for Vanta compatibility)
    await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js',
      'THREE'
    );
    
    // Then load Vanta.js
    await loadScript(
      'https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.waves.min.js',
      'VANTA'
    );
    
    return true;
  } catch (error) {
    throw error;
  }
}