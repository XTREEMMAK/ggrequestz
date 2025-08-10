<!--
  SEO and Social Media Meta Tags Component
-->

<script>
  let { 
    title = 'GG Requestz - Discover and Request Games',
    description = 'Discover new games, search our extensive library, and request your favorites. Your ultimate gaming companion.',
    keywords = 'games, gaming, game requests, game discovery, IGDB, game library, video games, PC games, console games, indie games, AAA games, game search, watchlist, gaming community',
    ogTitle = title,
    ogDescription = description,
    ogImage = '/icon-512.png',
    ogType = 'website',
    twitterCard = 'summary_large_image',
    canonical = null
  } = $props();
  
  // Use current URL if no canonical provided
  let canonicalUrl = $derived(canonical || (typeof window !== 'undefined' ? window.location.href : ''));
</script>

<svelte:head>
  <!-- Primary Meta Tags -->
  <title>{title}</title>
  <meta name="title" content={title} />
  <meta name="description" content={description} />
  <meta name="keywords" content={keywords} />
  
  <!-- Canonical URL -->
  {#if canonicalUrl}
    <link rel="canonical" href={canonicalUrl} />
  {/if}
  
  <!-- Open Graph / Facebook -->
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:type" content={ogType} />
  <meta property="og:url" content={canonicalUrl} />
  
  <!-- Twitter -->
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={ogImage} />
  <meta name="twitter:card" content={twitterCard} />
  
  <!-- Additional SEO -->
  <meta name="revisit-after" content="7 days" />
  <meta name="distribution" content="global" />
  <meta name="rating" content="general" />
</svelte:head>