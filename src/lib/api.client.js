/**
 * DEPRECATED: This file is deprecated. Use the new consolidated API structure instead.
 *
 * Migration guide:
 * import { searchGames, getAutocompleteSuggestions, ... } from '$lib/api';
 *
 * All functions are available from '$lib/api' with the same signatures.
 */

// Re-export from new consolidated API for backward compatibility
export {
  searchGames,
  getAutocompleteSuggestions,
  igdbRequest,
  submitGameRequest,
  sendNotification,
  rescindRequest,
} from "./api/index.js";
