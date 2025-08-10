<!--
  Login layout - no navigation, just the login content
-->

<script>
  let { children } = $props();
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="login-layout">
  {@render children()}
</div>

<style>
  :global(html, body) {
    height: 100%;
    overflow-x: hidden;
  }
  
  .login-layout {
    min-height: 100vh;
  }
</style>