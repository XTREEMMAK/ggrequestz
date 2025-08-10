<!--
  Search bar component with autocomplete suggestions and debounced input
-->

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { debounce } from '$lib/utils.js';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import Icon from '@iconify/svelte';
  
  let { 
    value = $bindable(''),
    placeholder = 'Search games...',
    suggestions = [],
    loading = false,
    disabled = false,
    showSuggestions = true,
    minLength = 2
  } = $props();
  
  const dispatch = createEventDispatcher();
  
  let inputElement;
  let showDropdown = $state(false);
  let selectedIndex = $state(-1);
  let searchTimeout;
  
  // Debounced search function
  const debouncedSearch = debounce((query) => {
    if (query.length >= minLength) {
      dispatch('search', { query });
    } else {
      dispatch('clear-suggestions');
    }
  }, 300);
  
  function handleInput(event) {
    selectedIndex = -1;
    
    if (value.length >= minLength) {
      showDropdown = showSuggestions;
      debouncedSearch(value);
    } else {
      showDropdown = false;
      dispatch('clear-suggestions');
    }
    
    dispatch('input', { value });
  }
  
  // Preserve focus after external updates
  let wasFocused = $state(false);
  
  function handleFocusEvent() {
    wasFocused = true;
    handleFocus();
  }
  
  function handleBlurEvent() {
    wasFocused = false;
    handleBlur();
  }
  
  // Restore focus if it was focused before an update
  $effect(() => {
    if (wasFocused && inputElement && document.activeElement !== inputElement) {
      inputElement.focus();
    }
  });
  
  function handleKeydown(event) {
    if (!showDropdown || suggestions.length === 0) {
      if (event.key === 'Enter') {
        handleSubmit();
      }
      return;
    }
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case 'Escape':
        showDropdown = false;
        selectedIndex = -1;
        inputElement?.blur();
        break;
      case 'Tab':
        showDropdown = false;
        selectedIndex = -1;
        break;
    }
  }
  
  function selectSuggestion(suggestion) {
    value = typeof suggestion === 'string' ? suggestion : suggestion.title;
    showDropdown = false;
    selectedIndex = -1;
    dispatch('select', { suggestion, value });
  }
  
  function handleSubmit() {
    if (value.trim()) {
      dispatch('submit', { value: value.trim() });
      showDropdown = false;
      selectedIndex = -1;
    }
  }
  
  function handleFocus() {
    if (suggestions.length > 0 && value.length >= minLength && showSuggestions) {
      showDropdown = true;
    }
    dispatch('focus');
  }
  
  function handleBlur() {
    // Delay hiding dropdown to allow for suggestion clicks
    setTimeout(() => {
      showDropdown = false;
      selectedIndex = -1;
    }, 150);
    dispatch('blur');
  }
  
  function clearSearch() {
    value = '';
    showDropdown = false;
    selectedIndex = -1;
    inputElement?.focus();
    dispatch('clear');
    dispatch('input', { value: '' });
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event) {
    if (!event.target.closest('.search-container')) {
      showDropdown = false;
      selectedIndex = -1;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="search-container relative w-full">
  <div class="relative">
    <!-- Search Input -->
    <div class="relative">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon icon="heroicons:magnifying-glass" class="h-5 w-5 text-gray-400" />
      </div>
      
      <input
        bind:this={inputElement}
        type="text"
        {placeholder}
        {disabled}
        bind:value
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={handleFocusEvent}
        onblur={handleBlurEvent}
        class="block w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg 
               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
               placeholder-gray-500 dark:placeholder-gray-400
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
               disabled:bg-gray-100 disabled:cursor-not-allowed
               transition-colors duration-200"
        autocomplete="off"
        spellcheck="false"
      />
      
      <!-- Loading Spinner or Clear Button -->
      <div class="absolute inset-y-0 right-0 pr-3 flex items-center">
        {#if loading}
          <LoadingSpinner size="sm" />
        {:else if value}
          <button
            type="button"
            onclick={clearSearch}
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear search"
          >
            <Icon icon="heroicons:x-mark" class="h-5 w-5" />
          </button>
        {/if}
      </div>
    </div>
    
    <!-- Suggestions Dropdown -->
    {#if showDropdown && suggestions.length > 0}
      <div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto custom-scrollbar">
        {#each suggestions as suggestion, index}
          {@const isSelected = index === selectedIndex}
          {@const displayText = typeof suggestion === 'string' ? suggestion : suggestion.title}
          
          <button
            type="button"
            class="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
            class:bg-blue-50={isSelected}
            class:dark:bg-blue-900={isSelected}
            class:text-blue-700={isSelected}
            class:dark:text-blue-300={isSelected}
            onclick={() => selectSuggestion(suggestion)}
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {displayText}
              </span>
              
              {#if typeof suggestion === 'object' && suggestion.platforms}
                <div class="ml-2 flex space-x-1">
                  {#each suggestion.platforms.slice(0, 3) as platform}
                    <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                      {platform}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
            
            {#if typeof suggestion === 'object' && suggestion.summary}
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                {suggestion.summary}
              </p>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>