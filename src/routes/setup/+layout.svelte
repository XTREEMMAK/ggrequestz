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
  :global(html, body) {
    height: 100%;
    overflow-x: hidden;
  }
  
  .setup-layout {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
</style>