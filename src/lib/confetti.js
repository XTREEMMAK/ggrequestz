/**
 * Confetti celebration utilities using canvas-confetti
 * Based on realistic implementations from https://www.kirilv.com/canvas-confetti/
 */

import confetti from 'canvas-confetti';

/**
 * Setup completion celebration - big realistic confetti effect
 */
export function setupCompleteConfetti() {
  const duration = 3000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    // Fire from multiple positions for a grand effect
    confetti(Object.assign({}, defaults, {
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
    }));

    confetti(Object.assign({}, defaults, {
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
    }));
  }, 250);
}

/**
 * Request submission celebration - full viewport confetti explosion
 */
export function requestSubmittedConfetti() {
  // Create a canvas that covers the full viewport
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  // Create confetti instance with full viewport canvas
  const myConfetti = confetti.create(canvas, {
    resize: true,
    useWorker: true
  });

  const count = 300; // Increased particle count for full screen
  const defaults = {
    origin: { y: 0.6 } // Slightly higher for better spread
  };

  function fire(particleRatio, opts) {
    myConfetti(Object.assign({}, defaults, opts, {
      particleCount: Math.floor(count * particleRatio)
    }));
  }

  // Multiple bursts covering the full screen
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1']
  });

  fire(0.2, {
    spread: 60,
    colors: ['#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF']
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    colors: ['#FFA07A', '#98D8C8', '#B4A7D6', '#FFB6C1']
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    colors: ['#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471']
  });

  // Additional side bursts for full coverage
  fire(0.15, {
    spread: 80,
    startVelocity: 45,
    origin: { x: 0.1, y: 0.6 },
    colors: ['#FF6B6B', '#4ECDC4', '#45B7D1']
  });

  fire(0.15, {
    spread: 80,
    startVelocity: 45,
    origin: { x: 0.9, y: 0.6 },
    colors: ['#96CEB4', '#FECA57', '#FF9FF3']
  });

  // Clean up canvas after animation completes
  setTimeout(() => {
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }, 5000);
}

/**
 * Small celebration for watchlist additions
 */
export function watchlistAddedConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#4ECDC4', '#45B7D1', '#96CEB4', '#54A0FF']
  });
}

/**
 * Realistic confetti effect for special achievements
 */
export function realisticConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 }
  };

  function fire(particleRatio, opts) {
    confetti(Object.assign({}, defaults, opts, {
      particleCount: Math.floor(count * particleRatio)
    }));
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}