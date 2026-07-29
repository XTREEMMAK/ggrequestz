<script>
  /**
   * Ambient particle background.
   *
   * Ported from LBHQ's GlobalBackground. Hand-rolled 2D canvas, no dependencies:
   * drifting particles over four CSS-only gradient blobs on slow orbits.
   *
   * The original had no performance guards at all. This version adds the ones a
   * decorative, always-running animation needs — see the constants below. It is
   * opt-in per user (`background_theme`), so the default cost is zero.
   */
  import { onMount } from "svelte";

  /**
   * Which background to render. "drifty-stars" is the only effect today; the
   * prop exists so a second one is a branch here plus a value in the settings
   * list, rather than a refactor. The layout does not mount this component at
   * all when the preference is "none".
   */
  let { variant = "drifty-stars" } = $props();

  let canvas = $state(null);

  // Cap the frame rate. The animation is ambient — particles drift at well
  // under a pixel per frame — so 30fps is visually indistinguishable from 60
  // and halves the compositing work.
  const TARGET_FPS = 30;
  const FRAME_MS = 1000 / TARGET_FPS;

  // Scale down on small viewports rather than rendering 60 particles on a
  // phone, where the GPU and the battery both care more.
  const PARTICLE_COUNT_DESKTOP = 60;
  const PARTICLE_COUNT_MOBILE = 24;
  const MOBILE_BREAKPOINT = 768;

  const COLORS = ["#FFB14D", "#F4C04A", "#9BA4B8", "#6A9BF0", "#F4EFE6"];

  onMount(() => {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    // Respect the OS setting. The source component explicitly declined to do
    // this; for an effect that exists purely for atmosphere there is no reason
    // to override someone who has asked for less motion. Render one static
    // frame so the palette still reads, then stop.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener("resize", resize);

    const count =
      width < MOBILE_BREAKPOINT ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 3 + 1.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: reducedMotion ? Math.random() * 0.4 + 0.2 : 0,
      target: Math.random() * 0.55 + 0.45,
      speed: Math.random() * 0.004 + 0.001,
      fadingIn: true,
    }));

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (reducedMotion) {
      paint();
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = 0;
    let paused = false;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);

      if (now - last < FRAME_MS) return;
      last = now;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Each particle breathes independently between opacity targets.
        if (p.fadingIn) {
          p.opacity = Math.min(p.opacity + p.speed, p.target);
          if (p.opacity >= p.target) {
            p.fadingIn = false;
            p.target = Math.random() * 0.65;
          }
        } else {
          p.opacity = Math.max(p.opacity - p.speed, 0);
          if (p.opacity <= 0) {
            p.fadingIn = true;
            p.target = Math.random() * 0.65 + 0.15;
          }
        }
      }

      paint();
    };

    // Browsers throttle rAF in background tabs but do not reliably stop it.
    // Stopping explicitly means a backgrounded tab costs nothing at all.
    const onVisibility = () => {
      if (document.hidden) {
        if (!paused) {
          paused = true;
          cancelAnimationFrame(raf);
        }
      } else if (paused) {
        paused = false;
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
</script>

<div class="ambient-bg" aria-hidden="true">
  <div class="blob blob-ember"></div>
  <div class="blob blob-ember2"></div>
  <div class="blob blob-gold"></div>
  <div class="blob blob-cool"></div>

  <canvas bind:this={canvas}></canvas>
</div>

<style>
  /* Sits behind page content. body sets background-color, which propagates to
     the canvas because html has none, so a negative z-index paints above that
     background but below in-flow content. The app has no light theme — :root in
     app.css is dark unconditionally — so there is no light variant here. */
  .ambient-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background: linear-gradient(165deg, #0c1430 0%, #0a0f1f 48%, #07091a 100%);
  }


  .blob {
    position: absolute;
    border-radius: 50%;
    backface-visibility: hidden;
    animation: orbit linear infinite;
  }

  .blob-ember {
    width: 80vmax;
    height: 80vmax;
    background: radial-gradient(
      circle,
      rgba(242, 116, 46, 0.42) 0%,
      transparent 68%
    );
    right: -18%;
    bottom: -18%;
    animation-duration: 45s;
    animation-delay: -10s;
    transform-origin: -20vw -14vh;
  }


  .blob-ember2 {
    width: 55vmax;
    height: 55vmax;
    background: radial-gradient(
      circle,
      rgba(216, 68, 46, 0.3) 0%,
      transparent 68%
    );
    left: 8%;
    top: 52%;
    animation-duration: 32s;
    animation-delay: -8s;
    transform-origin: 18vw -12vh;
  }


  .blob-gold {
    width: 50vmax;
    height: 50vmax;
    background: radial-gradient(
      circle,
      rgba(244, 192, 74, 0.24) 0%,
      transparent 65%
    );
    left: 32%;
    top: -12%;
    animation-duration: 55s;
    animation-delay: -20s;
    transform-origin: -8vw 16vh;
  }


  .blob-cool {
    width: 72vmax;
    height: 72vmax;
    background: radial-gradient(
      circle,
      rgba(40, 70, 150, 0.52) 0%,
      transparent 65%
    );
    left: -18%;
    top: -18%;
    animation-duration: 38s;
    animation-delay: -15s;
    transform-origin: 22vw 20vh;
  }


  @keyframes orbit {
    100% {
      transform: translate3d(0, 0, 1px) rotate(360deg);
    }
  }

  /* Unlike the source, the blob orbits stop for reduced-motion too. A 45s
     rotation is still motion. */
  @media (prefers-reduced-motion: reduce) {
    .blob {
      animation: none;
    }
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
