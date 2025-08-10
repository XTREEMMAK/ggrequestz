<script>
	import '../app.css';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	
	let { data, children } = $props();
	
	let user = $derived(data?.user || null);
	let userPermissions = $derived(data?.userPermissions || { isAdmin: false });
	let rommAvailable = $derived(data?.rommAvailable || false);
	let rommServerUrl = $derived(data?.rommServerUrl || null);
	let customNavItems = $derived(data?.customNavItems || []);
	let authMethod = $derived(data?.authMethod || 'authentik');
	let needsSetup = $derived(data?.needsSetup || false);
	let basicAuthEnabled = $derived(data?.basicAuthEnabled || false);
	
	// Check for URL parameters that indicate we should refresh user state
	$effect(() => {
		if (browser) {
			const url = new URL(window.location);
			const refreshParam = url.searchParams.get('t');
			if (refreshParam) {
				// Remove the refresh parameter from URL without page reload
				url.searchParams.delete('t');
				window.history.replaceState({}, '', url);
				// Invalidate all data to refresh user state
				invalidateAll();
			}
		}
	});
	
	let sidebarOpen = $state(false);
	
	// Base navigation items with positions
	const baseNavigation = [
		{ name: 'Discover', href: '/', icon: 'home', position: 10 },
		{ name: 'Requests', href: '/request', icon: 'plus', position: 20 },
		{ name: 'Search', href: '/search', icon: 'search', position: 30 },
		{ name: 'Profile', href: '/profile', icon: 'user', position: 40 }
	];
	
	// Dynamic navigation based on permissions and availability
	let navigation = $derived.by(() => {
		let allNavItems = [...baseNavigation];
		
		// Add Game Library if ROMM is available (position 35, between Search and Profile)
		if (rommAvailable && rommServerUrl) {
			allNavItems.push({ 
				name: 'Game Library', 
				href: rommServerUrl, 
				icon: 'library', 
				external: true,
				position: 35
			});
		}
		
		// Find the highest position among factory items (base nav + ROMM)
		const factoryItems = [...allNavItems];
		const maxFactoryPosition = Math.max(...factoryItems.map(item => item.position));
		const customStartPosition = maxFactoryPosition + 100; // Start custom items 100 positions after factory items
		
		// Add custom navigation items with adjusted positions to ensure they come after factory items
		for (const customItem of customNavItems) {
			allNavItems.push({ 
				name: customItem.name, 
				href: customItem.href, 
				icon: customItem.icon, 
				external: customItem.is_external,
				// Adjust position: add to customStartPosition to maintain relative ordering but ensure after factory items
				position: customStartPosition + (customItem.position || 0)
			});
		}
		
		// Add Admin Panel if user has admin permissions (position 1000, always last)
		if (user && userPermissions.isAdmin) {
			allNavItems.push({ 
				name: 'Admin Panel', 
				href: '/admin', 
				icon: 'admin',
				position: 1000
			});
		}
		
		// Sort all items by position
		return allNavItems.sort((a, b) => a.position - b.position);
	});
	
	let currentPath = $derived($page.url.pathname);
	
	// Hide mobile search bar on search and request pages
	let shouldShowMobileSearchBar = $derived(
		currentPath !== '/search' && currentPath !== '/request'
	);
	
	// Hide entire mobile header on admin pages, login pages, and setup pages
	let shouldShowMobileHeader = $derived(
		!currentPath.startsWith('/admin') && 
		!currentPath.startsWith('/login') &&
		!currentPath.startsWith('/setup')
	);
	
	// Hide sidebar navigation on login pages and setup pages
	let shouldShowSidebar = $derived(
		!currentPath.startsWith('/login') &&
		!currentPath.startsWith('/setup')
	);
	
	function isActivePath(path) {
		if (path === '/') {
			return currentPath === '/';
		}
		return currentPath.startsWith(path);
	}
	
	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}
</script>

<div class="min-h-screen" style="background-color: var(--bg-primary);">
	<!-- Mobile sidebar overlay (hidden on login pages) -->
	{#if shouldShowSidebar}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div 
		class="fixed inset-0 z-40 lg:hidden cursor-pointer {sidebarOpen ? 'block' : 'hidden'}"
		style="background-color: var(--overlay);"
		onclick={toggleSidebar}
		aria-label="Close sidebar"
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleSidebar() : null}
	></div>
	{/if}

	<!-- Sidebar (hidden on login pages) -->
	{#if shouldShowSidebar}
	<div class="fixed inset-y-0 left-0 z-50 w-64 sidebar transform transition-transform duration-200 ease-in-out lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}">
		<!-- Logo/Header -->
		<div class="flex items-center justify-between h-26 px-4" style="border-bottom: 1px solid var(--border-color);">
			<div class="flex-1 flex items-center justify-center">
				<img 
					src="/GGR_Logo.webp" 
					alt="GameRequest Logo" 
					class="h-24 w-auto"
				/>
			</div>
			
			<!-- Mobile close button -->
			<button class="lg:hidden text-gray-400 hover:text-white" onclick={toggleSidebar} aria-label="Close sidebar">
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
				</svg>
			</button>
		</div>

		<!-- Navigation -->
		<nav class="mt-4 px-2">
			{#each navigation as item}
				<a
					href={item.href}
					class="sidebar-item mb-1 rounded-lg {isActivePath(item.href) ? 'active' : ''}"
					onclick={() => { sidebarOpen = false; }}
					target={item.external ? '_blank' : '_self'}
					rel={item.external ? 'noopener noreferrer' : undefined}
				>
					<!-- Icons -->
					{#if item.icon === 'home'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
						</svg>
					{:else if item.icon === 'plus'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
					{:else if item.icon === 'search'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
						</svg>
					{:else if item.icon === 'user'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
						</svg>
					{:else if item.icon === 'library'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
						</svg>
					{:else if item.icon === 'admin'}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
						</svg>
					{:else if item.icon && item.icon.includes(':')}
						<!-- Custom Heroicons -->
						<Icon icon={item.icon} class="w-5 h-5" />
					{:else}
						<!-- Default icon for unrecognized icons -->
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
						</svg>
					{/if}
					<span class="font-medium">{item.name}</span>
				</a>
			{/each}
		</nav>

		<!-- User section -->
		<div class="absolute bottom-0 left-0 right-0 p-4" style="border-top: 1px solid var(--border-color);">
			{#if user}
				<div class="flex items-center space-x-3">
					<div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
						<span class="text-sm font-medium text-white">U</span>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-white truncate">
							{user?.name || user?.username || user?.preferred_username || 'User'}
						</p>
						{#if user?.auth_type === 'basic'}
							<p class="text-xs text-gray-400 truncate">Basic Auth</p>
						{/if}
					</div>
					<a href="/api/auth/logout" class="text-gray-400 hover:text-white" aria-label="Sign out">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
						</svg>
					</a>
				</div>
			{:else}
				<!-- Show appropriate login link based on auth method -->
				{#if authMethod === 'basic'}
					{#if needsSetup}
						<a href="/setup" class="flex items-center justify-center w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors">
							Initial Setup
						</a>
					{:else}
						<a href="/auth/login" class="flex items-center justify-center w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
							Sign In
						</a>
					{/if}
				{:else}
					<a href="/api/auth/login" class="flex items-center justify-center w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
						Sign In
					</a>
				{/if}
			{/if}
		</div>
	</div>
	{/if}

	<!-- Mobile header with menu button and search -->
	{#if shouldShowMobileHeader}
	<div class="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
		<div class="flex items-center justify-between p-4">
			<button
				onclick={toggleSidebar}
				class="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
				aria-label="Open sidebar"
			>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
				</svg>
			</button>
			
			<!-- Mobile search input with conditional visibility -->
			{#if shouldShowMobileSearchBar}
				<div 
					class="flex-1 max-w-md mx-4"
					transition:slide={{ duration: 300, easing: cubicOut }}
				>
					<div class="relative">
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search games..."
							class="block w-full pl-10 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
							onkeydown={(e) => {
								if (e.key === 'Enter' && e.target.value.trim()) {
									window.location.href = `/search?q=${encodeURIComponent(e.target.value.trim())}`;
								}
							}}
						/>
					</div>
				</div>
			{:else}
				<!-- Empty spacer to maintain layout when search bar is hidden -->
				<div class="flex-1 mx-4"></div>
			{/if}
			
			<!-- User avatar or login link -->
			<div class="flex-shrink-0">
				{#if user}
					<a href="/profile" class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
						<span class="text-sm font-medium text-white">U</span>
					</a>
				{:else}
					<!-- Show appropriate login link for mobile based on auth method -->
					{#if authMethod === 'basic'}
						{#if needsSetup}
							<a href="/setup" class="text-orange-400 hover:text-orange-300 text-sm font-medium">
								Setup
							</a>
						{:else}
							<a href="/auth/login" class="text-blue-400 hover:text-blue-300 text-sm font-medium">
								Sign In
							</a>
						{/if}
					{:else}
						<a href="/api/auth/login" class="text-blue-400 hover:text-blue-300 text-sm font-medium">
							Sign In
						</a>
					{/if}
				{/if}
			</div>
		</div>
	</div>
	{/if}

	<!-- Main content -->
	<main class="{shouldShowSidebar ? 'lg:pl-64' : ''} {shouldShowMobileHeader ? 'pt-24' : 'pt-0'} lg:pt-0">
		{@render children()}
	</main>
</div>
