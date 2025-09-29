// Disable SvelteKit's automatic scroll restoration
if (typeof window !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

export const handleError = ({ error, event }) => {};
