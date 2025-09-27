/**
 * Sidebar state store for sharing collapse state between layout and page components
 */
import { writable } from "svelte/store";

// Create a writable store for sidebar collapse state
export const sidebarCollapsed = writable(false);

// Export a convenient function to toggle the state
export function toggleSidebarCollapse() {
  sidebarCollapsed.update((collapsed) => !collapsed);
}
