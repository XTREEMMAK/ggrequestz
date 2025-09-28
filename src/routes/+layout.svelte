<script>
	import '../app.css';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import { slide, scale, fly } from 'svelte/transition';
	import { cubicOut, quintOut } from 'svelte/easing';
	import Toast from '../components/Toast.svelte';
	import { sidebarCollapsed as sidebarCollapsedStore } from '$lib/stores/sidebar.js';
	
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
	onMount(() => {
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

			// Set initial window width
			windowWidth = window.innerWidth;

			// Add resize listener to track window width
			const handleResize = () => {
				const newWidth = window.innerWidth;
				windowWidth = newWidth;

				// Immediately reset sidebar collapse when going to mobile
				if (newWidth < 1024 && sidebarCollapsed) {
					sidebarCollapsed = false;
				}
			};

			window.addEventListener('resize', handleResize);

			// Handle scroll to top button visibility (exclude home page)
			const handleScroll = () => {
				const isHomePage = currentPath === '/';
				showScrollToTop = !isHomePage && window.scrollY > 300;
			};
			window.addEventListener('scroll', handleScroll, { passive: true });

			// Fetch app version
			fetch('/api/version')
				.then(response => response.json())
				.then(data => {
					appVersion = data.version;
				})
				.catch(() => {
					// Silently fail - version display is not critical
				});

			// Cleanup function
			return () => {
				window.removeEventListener('resize', handleResize);
				window.removeEventListener('scroll', handleScroll);
			};
		}
	});
	
	let sidebarOpen = $state(false);
	let sidebarCollapsed = $state(false);
	let userMenuOpen = $state(false);
	let appDetailsOpen = $state(false);

	// Sync local state with store
	$effect(() => {
		sidebarCollapsedStore.set(sidebarCollapsed);
	});
	let windowWidth = $state(0);
	let appVersion = $state(null);

	// Reset sidebar collapse when switching to mobile view
	$effect(() => {
		// lg breakpoint is 1024px in Tailwind CSS
		// Always ensure sidebar is not collapsed on mobile/tablet view
		if (windowWidth > 0 && windowWidth < 1024) {
			if (sidebarCollapsed) {
				sidebarCollapsed = false;
			}
		}
	});

	// Base navigation items with positions
	const baseNavigation = [
		{ name: 'Discover', href: '/', icon: 'home', position: 10 },
		{ name: 'Requests', href: '/request', icon: 'plus', position: 20 },
		{ name: 'Search', href: '/search', icon: 'search', position: 30 }
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

	// Scroll to top button state
	let showScrollToTop = $state(false);
	
	// Hide mobile search bar on search and request pages
	let shouldShowMobileSearchBar = $derived(
		currentPath !== '/search' && currentPath !== '/request'
	);
	
	// Hide entire mobile header on admin pages, login pages, setup pages, and register pages
	let shouldShowMobileHeader = $derived(
		!currentPath.startsWith('/admin') &&
		!currentPath.startsWith('/login') &&
		!currentPath.startsWith('/setup') &&
		!currentPath.startsWith('/register')
	);

	// Hide sidebar navigation on login pages, setup pages, register pages, and admin pages
	let shouldShowSidebar = $derived(
		!currentPath.startsWith('/login') &&
		!currentPath.startsWith('/setup') &&
		!currentPath.startsWith('/register') &&
		!currentPath.startsWith('/admin')
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

	function toggleSidebarCollapse() {
		sidebarCollapsed = !sidebarCollapsed;
	}

	function toggleUserMenu() {
		userMenuOpen = !userMenuOpen;
	}
	function toggleAppDetails() {
		appDetailsOpen = !appDetailsOpen;
	}

	function navigateToProfile() {
		goto('/profile');
		userMenuOpen = false;
		sidebarOpen = false; // Close mobile sidebar if open
	}

	// Close menus when clicking outside
	function handleClickOutside(event) {
		if (userMenuOpen && !event.target.closest('.user-menu-container')) {
			userMenuOpen = false;
		}
		if (appDetailsOpen && !event.target.closest('.app-details-container')) {
			appDetailsOpen = false;
		}
	}

	// Scroll to top function
	function scrollToTop() {
		window.scrollTo({
			top: 0,
			behavior: 'smooth'
		});
	}
</script>

<div class="min-h-screen" style="background-color: var(--bg-primary);" onclick={handleClickOutside}>
	<!-- Mobile sidebar overlay (hidden on login, setup, register, and admin pages) -->
	{#if shouldShowSidebar}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-40 lg:hidden cursor-pointer {sidebarOpen ? 'block' : 'hidden'} {currentPath.startsWith('/admin') ? 'hidden' : ''}"
		style="background-color: var(--overlay);"
		onclick={toggleSidebar}
		aria-label="Close sidebar"
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleSidebar() : null}
	></div>
	{/if}

	<!-- Sidebar (hidden on login, setup, register, and admin pages) -->
	{#if shouldShowSidebar}
	<div class="fixed inset-y-0 left-0 z-50 sidebar transform transition-all duration-200 ease-in-out lg:translate-x-0 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} {sidebarCollapsed ? 'w-16' : 'w-64'} {currentPath.startsWith('/admin') ? 'hidden !important' : ''}">
		<!-- Logo/Header -->
		<div class="flex items-center justify-between h-26 px-4" style="border-bottom: 1px solid var(--border-color);">
			{#if !sidebarCollapsed}
				<div class="flex-1 flex items-center justify-center">
					<img
						src="/GGR_Logo.webp"
						alt="G.G Requestz Logo"
						class="h-24 w-auto"
					/>
				</div>
			{:else}
				<div class="flex-1 flex items-center justify-center">
					<div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
						<span class="text-white font-bold text-sm">GG</span>
					</div>
				</div>
			{/if}

			<!-- Desktop collapse button -->
			{#if !sidebarCollapsed}
				<button class="hidden lg:block text-gray-400 hover:text-white ml-2" onclick={toggleSidebarCollapse} aria-label="Collapse sidebar">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
					</svg>
				</button>
			{/if}

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
				{#if item.external}
					<!-- External links stay as <a> tags -->
					<a
						href={item.href}
						class="sidebar-item mb-1 rounded-lg {isActivePath(item.href) ? 'active' : ''} {sidebarCollapsed ? 'justify-center relative group' : ''}"
						target="_blank"
						rel="noopener noreferrer"
					>
						<!-- Icons -->
						{#if item.icon === 'home'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
							</svg>
						{:else if item.icon === 'plus'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
							</svg>
						{:else if item.icon === 'search'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						{:else if item.icon === 'user'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
						{:else if item.icon === 'library'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
							</svg>
						{:else if item.icon === 'settings'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
							</svg>
						{:else if item.icon === 'admin'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
							</svg>
						{:else if item.icon}
							<!-- Custom icon from iconify -->
							<Icon icon={item.icon} class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" />
						{:else}
							<!-- Default icon for unrecognized icons -->
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
							</svg>
						{/if}
						{#if !sidebarCollapsed}
							<span class="font-medium">{item.name}</span>
						{:else}
							<!-- Tooltip for collapsed sidebar -->
							<div class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
								{item.name}
							</div>
						{/if}
					</a>
				{:else}
					<!-- Internal links use goto() for faster navigation -->
					<button
						type="button"
						onclick={() => { goto(item.href); sidebarOpen = false; }}
						class="sidebar-item mb-1 rounded-lg {isActivePath(item.href) ? 'active' : ''} w-full {sidebarCollapsed ? 'justify-center relative group' : 'text-left'}"
						aria-label="Navigate to {item.name}"
					>
						<!-- Icons -->
						{#if item.icon === 'home'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
							</svg>
						{:else if item.icon === 'plus'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
							</svg>
						{:else if item.icon === 'search'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						{:else if item.icon === 'user'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
						{:else if item.icon === 'library'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
							</svg>
						{:else if item.icon === 'settings'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
							</svg>
						{:else if item.icon === 'admin'}
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
							</svg>
						{:else if item.icon}
							<!-- Custom icon from iconify -->
							<Icon icon={item.icon} class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" />
						{:else}
							<!-- Default icon for unrecognized icons -->
							<svg class="{sidebarCollapsed ? 'w-6 h-6 block' : 'w-5 h-5'}" style="{sidebarCollapsed ? 'margin-left: auto; margin-right: auto;' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
							</svg>
						{/if}
						{#if !sidebarCollapsed}
							<span class="font-medium">{item.name}</span>
						{:else}
							<!-- Tooltip for collapsed sidebar -->
							<div class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
								{item.name}
							</div>
						{/if}
					</button>
				{/if}
			{/each}
		</nav>

		<!-- User section -->
		<div class="absolute bottom-0 left-0 right-0 p-4" style="border-top: 1px solid var(--border-color);">
			{#if user}
				{#if sidebarCollapsed}
					<!-- Collapsed sidebar: Profile button with submenu -->
					<div class="relative user-menu-container">
						<button
							onclick={toggleUserMenu}
							class="w-full flex flex-col items-center space-y-2 p-2 rounded-lg hover:bg-gray-700 transition-colors group"
							aria-label="User menu"
						>
							<div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
								<span class="text-sm font-medium text-white">U</span>
							</div>
							<!-- Show tooltip on hover when collapsed -->
							<div class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 bottom-0">
								{user?.name || user?.username || user?.preferred_username || 'User'}
							</div>
						</button>

						<!-- Submenu for collapsed sidebar -->
						{#if userMenuOpen}
							<div
								class="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg w-48 z-50"
								transition:slide={{ duration: 200, easing: cubicOut }}
							>
								<div class="p-2">
									<div class="px-3 py-2 border-b border-gray-700 mb-1">
										<p class="text-sm font-medium text-white truncate">
											{user?.name || user?.username || user?.preferred_username || 'User'}
										</p>
										{#if user?.auth_type === 'basic'}
											<p class="text-xs text-gray-400 truncate">Basic Auth</p>
										{/if}
									</div>
									<button
										onclick={navigateToProfile}
										class="w-full flex items-center space-x-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-left"
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
										</svg>
										<span class="text-sm">Profile</span>
									</button>
									<a
										href="/api/auth/logout"
										class="w-full flex items-center space-x-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
									>
										<Icon icon="material-symbols:logout" class="w-4 h-4" />
										<span class="text-sm">Sign Out</span>
									</a>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Expanded sidebar: Profile button with submenu -->
					<div class="relative user-menu-container">
						<button
						onclick={toggleUserMenu}
						class="w-full flex items-center space-x-3 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors mb-2"
						aria-label="User menu"
					>
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
						<svg class="w-4 h-4 text-gray-400 transition-transform duration-200 {userMenuOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
						</svg>
					</button>

					<!-- Submenu for expanded sidebar -->
					{#if userMenuOpen}
						<div
							class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-2"
							transition:slide={{ duration: 200, easing: cubicOut }}
						>
							<button
								onclick={navigateToProfile}
								class="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors text-left"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
								</svg>
								<span class="text-sm">Profile</span>
							</button>
							<a
								href="/api/auth/logout"
								class="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors border-t border-gray-700"
							>
								<Icon icon="material-symbols:logout" class="w-4 h-4" />
								<span class="text-sm">Sign Out</span>
							</a>
						</div>
					{/if}
					</div>
				{/if}
				
				<!-- App Details Button -->
				{#if appVersion && !sidebarCollapsed}
					<div class="text-center app-details-container">
						<button
							onclick={toggleAppDetails}
							class="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded hover:bg-gray-700"
							title="App Details"
						>
							v{appVersion}
						</button>
					</div>
				{/if}
			{:else}
				<!-- Show appropriate login link based on auth method -->
				{#if authMethod === 'basic'}
					{#if needsSetup}
						<a href="/setup" class="flex items-center justify-center w-full py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors">
							Initial Setup
						</a>
					{:else}
						<a href="/login" class="flex items-center justify-center w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
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

	<!-- Floating expand button for collapsed sidebar -->
	{#if sidebarCollapsed && shouldShowSidebar}
		<button
			class="hidden lg:block fixed top-4 left-20 z-50 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white p-2 rounded-lg shadow-lg transition-all duration-200 {currentPath.startsWith('/admin') ? 'hidden !important' : ''}"
			onclick={toggleSidebarCollapse}
			aria-label="Expand sidebar"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
			</svg>
		</button>
	{/if}
	{/if}

	<!-- Mobile header with menu button and search -->
	{#if shouldShowMobileHeader}
	<div class="lg:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
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
					<button
						type="button"
						onclick={() => goto('/profile')}
						class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
						aria-label="Navigate to Profile"
					>
						<span class="text-sm font-medium text-white">U</span>
					</button>
				{:else}
					<!-- Show appropriate login link for mobile based on auth method -->
					{#if authMethod === 'basic'}
						{#if needsSetup}
							<a href="/setup" class="text-orange-400 hover:text-orange-300 text-sm font-medium">
								Setup
							</a>
						{:else}
							<a href="/login" class="text-blue-400 hover:text-blue-300 text-sm font-medium">
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
	<main class="{shouldShowSidebar ? (sidebarCollapsed ? 'lg:pl-16 lg:pt-16' : 'lg:pl-64 lg:pt-0') : ''} {shouldShowMobileHeader ? 'pt-24' : (shouldShowSidebar && !sidebarCollapsed ? 'pt-0' : '')} transition-all duration-200">
		{@render children()}
	</main>

	<!-- Scroll to Top Button (hidden on home page) -->
	{#if showScrollToTop}
		<button
			onclick={scrollToTop}
			class="fixed bottom-8 right-8 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 ease-out hover:scale-105"
			in:scale={{ duration: 200, start: 0.8 }}
			out:scale={{ duration: 200, start: 0.8 }}
			aria-label="Scroll to top"
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
			</svg>
		</button>
	{/if}
</div>

<!-- App Details Fullscreen Modal -->
{#if appDetailsOpen}
	<div
		class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
		transition:fly={{ duration: 300, easing: cubicOut, opacity: 0 }}
	>
		<div
			class="bg-gray-800 border border-gray-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto relative"
			transition:scale={{ duration: 300, easing: cubicOut, start: 0.9 }}
		>
			<!-- Close button positioned absolutely -->
			<button
				onclick={toggleAppDetails}
				class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1 z-10"
				aria-label="Close modal"
			>
				<Icon icon="heroicons:x-mark" class="w-6 h-6" />
			</button>

			<!-- Modal Content -->
			<div class="p-8">
				<!-- Large App Logo -->
				<div class="flex items-center justify-center mb-6">
					<img src="/GGR_Logo.webp" alt="GG Requestz Logo" class="w-48 h-36 object-contain" />
				</div>

				<div class="text-center mb-6">
					<p class="text-gray-400 mb-1">Version {appVersion}</p>
					<p class="text-sm text-gray-500">A modern game discovery and request management platform</p>
				</div>

				<!-- Links Section -->
				<div class="space-y-3">
					<a
						href="https://github.com/XTREEMMAK/ggrequestz"
						target="_blank"
						rel="noopener noreferrer"
						class="w-full flex items-center space-x-4 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group"
					>
						<Icon icon="heroicons:code-bracket" class="w-5 h-5" />
						<div class="flex-1">
							<span class="text-sm font-medium">View Source Code</span>
							<p class="text-xs text-gray-500">Browse the project repository</p>
						</div>
						<Icon icon="heroicons:arrow-top-right-on-square" class="w-4 h-4 opacity-50 group-hover:opacity-100" />
					</a>

					<a
						href="https://github.com/XTREEMMAK/ggrequestz/issues"
						target="_blank"
						rel="noopener noreferrer"
						class="w-full flex items-center space-x-4 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group"
					>
						<Icon icon="heroicons:bug-ant" class="w-5 h-5" />
						<div class="flex-1">
							<span class="text-sm font-medium">Report Issues</span>
							<p class="text-xs text-gray-500">Submit bug reports and feature requests</p>
						</div>
						<Icon icon="heroicons:arrow-top-right-on-square" class="w-4 h-4 opacity-50 group-hover:opacity-100" />
					</a>

					<a
						href="https://github.com/XTREEMMAK/ggrequestz/releases"
						target="_blank"
						rel="noopener noreferrer"
						class="w-full flex items-center space-x-4 px-4 py-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group"
					>
						<Icon icon="heroicons:rocket-launch" class="w-5 h-5" />
						<div class="flex-1">
							<span class="text-sm font-medium">Release Notes</span>
							<p class="text-xs text-gray-500">View changelog and updates</p>
						</div>
						<Icon icon="heroicons:arrow-top-right-on-square" class="w-4 h-4 opacity-50 group-hover:opacity-100" />
					</a>
				</div>

				<!-- Future extensibility placeholder -->
				<!-- Additional sections can be added here:
				     - Documentation links
				     - License information
				     - Contributors
				     - System information
				     - Statistics
				-->
			</div>
		</div>
	</div>
{/if}

<!-- Toast notifications -->
<Toast />
