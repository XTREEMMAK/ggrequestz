/**
 * Required API key scope per route.
 *
 * Scopes were stored on every key and selected in the admin UI, but nothing
 * ever checked them — `verifyScopes` in `apiKeys.js` and its `checkApiScopes`
 * wrapper in `auth.server.js` both had zero callers — so a key stamped
 * `games:read` carried its owner's full privileges. This table is what makes
 * the selection mean something.
 *
 * Resolution is **default-deny**: a path with no entry here is refused to API
 * keys. New routes are therefore closed until someone classifies them, which is
 * the property that makes it safe to hand keys to third-party integrations.
 * Cookie sessions never consult this table.
 */

/**
 * Longest prefix wins, so the order of this array does not matter — see the
 * sort in `resolveRequiredScope`. Methods are matched exactly, except that HEAD
 * is treated as GET.
 *
 * Note that some POST endpoints are reads: `/api/search`, `/api/igdb` and
 * `/api/romm/cross-reference` take a query body, and `/api/watchlist/batch`
 * takes a list of game IDs and returns their watchlist status.
 */
const ROUTE_SCOPES = [
  // Requests
  {
    prefix: "/api/request/rescind",
    methods: ["POST"],
    scope: "requests:write",
  },
  { prefix: "/api/request", methods: ["GET"], scope: "requests:read" },
  { prefix: "/api/request", methods: ["POST"], scope: "requests:write" },

  // Watchlist
  {
    prefix: "/api/watchlist/status",
    methods: ["GET"],
    scope: "watchlist:read",
  },
  {
    prefix: "/api/watchlist/batch",
    methods: ["POST"],
    scope: "watchlist:read",
  },
  { prefix: "/api/watchlist/add", methods: ["POST"], scope: "watchlist:write" },
  {
    prefix: "/api/watchlist/remove",
    methods: ["POST"],
    scope: "watchlist:write",
  },

  // User
  { prefix: "/api/user/preferences", methods: ["GET"], scope: "user:read" },
  { prefix: "/api/user/preferences", methods: ["POST"], scope: "user:write" },

  // Game data
  { prefix: "/api/games", methods: ["GET"], scope: "games:read" },
  { prefix: "/api/browse", methods: ["GET"], scope: "games:read" },
  { prefix: "/api/search", methods: ["GET", "POST"], scope: "games:read" },
  { prefix: "/api/igdb", methods: ["GET", "POST"], scope: "games:read" },
  { prefix: "/api/romm/recent", methods: ["GET"], scope: "games:read" },
  {
    prefix: "/api/romm/cross-reference",
    methods: ["POST"],
    scope: "games:read",
  },

  // Administrative
  { prefix: "/api/cache/stats", methods: ["GET"], scope: "admin:read" },
  { prefix: "/api/cache/stats", methods: ["DELETE"], scope: "admin:write" },
  { prefix: "/api/cache/clear", methods: ["POST"], scope: "admin:write" },
  { prefix: "/api/cache/cleanup", methods: ["POST"], scope: "admin:write" },
  { prefix: "/api/romm/clear-cache", methods: ["POST"], scope: "admin:write" },
  { prefix: "/api/admin", methods: ["POST"], scope: "admin:write" },
];

// Longest prefix first, so `/api/request/rescind` is considered before
// `/api/request` regardless of how the array above is ordered.
const SORTED_ROUTE_SCOPES = [...ROUTE_SCOPES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/**
 * Whether a pathname sits at or below a prefix.
 *
 * A plain `startsWith` would let `/api/requests-elsewhere` match `/api/request`,
 * so the next character has to be a boundary.
 */
function matchesPrefix(pathname, prefix) {
  if (!pathname.startsWith(prefix)) {
    return false;
  }
  const next = pathname.charAt(prefix.length);
  return next === "" || next === "/" || next === "?";
}

/**
 * The scope an API key needs to call a route.
 *
 * @param {string} pathname - Request pathname, e.g. "/api/request"
 * @param {string} method - HTTP method
 * @returns {string|null} - Required scope, or null when the route has no entry
 *   (callers must treat null as deny, not as allow)
 */
export function resolveRequiredScope(pathname, method) {
  const normalizedMethod = method === "HEAD" ? "GET" : method;

  for (const entry of SORTED_ROUTE_SCOPES) {
    if (
      matchesPrefix(pathname, entry.prefix) &&
      entry.methods.includes(normalizedMethod)
    ) {
      return entry.scope;
    }
  }

  return null;
}
