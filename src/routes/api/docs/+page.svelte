<script>
	import { onMount } from 'svelte';
	import '@scalar/api-reference/style.css';

	let apiReferenceEl;

	onMount(async () => {
		// Dynamically import Scalar to avoid SSR issues
		const Scalar = await import('@scalar/api-reference');

		if (apiReferenceEl) {
			// Initialize Scalar API Reference using the correct method
			Scalar.createApiReference(apiReferenceEl, {
				spec: {
					url: '/api/openapi.json'
				},
				configuration: {
					theme: 'default',
					layout: 'modern',
					defaultOpenAllTags: false,
					showSidebar: true,
					darkMode: true,
					authentication: {
						preferredSecurityScheme: 'bearerAuth',
						apiKey: {
							token: ''
						}
					}
				},
				customCss: `
					.scalar-api-reference {
						--scalar-font: system-ui, -apple-system, sans-serif;
						--scalar-radius: 0.5rem;
					}
				`
			});
		}
	});
</script>

<svelte:head>
	<title>API Documentation - GG Requestz</title>
	<meta name="description" content="Interactive API documentation for GG Requestz" />
</svelte:head>

<div class="api-docs-container">
	<div bind:this={apiReferenceEl} class="api-reference"></div>
</div>

<style>
	.api-docs-container {
		width: 100%;
		min-height: 100vh;
		background: var(--scalar-background-1, #fff);
	}

	.api-reference {
		width: 100%;
		min-height: 100vh;
	}

	:global(body) {
		margin: 0;
		padding: 0;
	}
</style>
