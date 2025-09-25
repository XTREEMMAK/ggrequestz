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
  :global(html, body) {
    height: 100%;
    overflow-x: hidden;
  }

  .register-layout {
    min-height: 100vh;
  }
</style>