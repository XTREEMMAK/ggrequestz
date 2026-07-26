<!--
  Setup layout - no navigation, clean setup experience
-->

<script>
  let { children } = $props();
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="setup-layout min-h-screen">
  {@render children()}
</div>

<style>
  /* Do NOT set height here. Svelte injects :global rules into the document when
     this layout mounts, and they are not removed on unmount — so a height:100%
     set for the login screen survives client-side navigation into the app,
     pins <html> to the viewport height, and makes <body> the scroll container.
     window.scrollY then reads 0 forever, which silently breaks scroll
     restoration everywhere. The .setup-layout wrapper below already provides
     full height via min-height: 100vh. */
  :global(html, body) {
    overflow-x: hidden;
  }
  
  .setup-layout {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
</style>