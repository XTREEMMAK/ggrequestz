<!--
  Registration layout - no navigation, just the registration content
-->

<script>
  let { children } = $props();
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="register-layout">
  {@render children()}
</div>

<style>
  /* Do NOT set height here. Svelte injects :global rules into the document when
     this layout mounts, and they are not removed on unmount, so a height:100%
     set for the login screen survives client-side navigation into the app,
     pins <html> to the viewport height, and makes <body> the scroll container.
     window.scrollY then reads 0 forever, which silently breaks scroll
     restoration everywhere. The .register-layout wrapper below already provides
     full height via min-height: 100vh. */
  :global(html, body) {
    overflow-x: hidden;
  }

  .register-layout {
    min-height: 100vh;
  }
</style>