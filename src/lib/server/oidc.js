/**
 * Generic OpenID Connect provider support.
 *
 * Replaces the previous Authentik-only implementation, which hardcoded
 * Authentik's `/application/o/{authorize,token,userinfo}/` path scheme and
 * discarded the path portion of the issuer URL. No other provider uses those
 * paths, which is why `AUTH_METHOD=oidc_generic` never worked (issues #4, #7).
 *
 * Endpoints are resolved from the provider's discovery document
 * (`/.well-known/openid-configuration`) and cached. Explicit `OIDC_*_URL`
 * overrides are honoured for providers that do not publish one.
 *
 * Configuration precedence: `OIDC_*` first, then the legacy `AUTHENTIK_*`
 * names, so existing installs keep working with no environment changes.
 */

import { browser } from "$app/environment";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { fetchWithTimeout } from "$lib/utils.js";

if (browser) {
  throw new Error("oidc.js is server-only");
}

// Every outbound call to the identity provider is bounded.
const IDP_TIMEOUT_MS = 8000;
// Discovery documents are effectively static; re-read hourly.
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

/**
 * Read a config value, preferring the new name over the legacy one.
 *
 * Three sources, because no single one carries everything:
 *
 * - `$env/dynamic/private` omits anything with the public prefix by design, so
 *   `PUBLIC_SITE_URL` is never visible here.
 * - `$env/dynamic/public` carries exactly those, and is where
 *   `PUBLIC_SITE_URL` actually lives.
 * - `process.env` holds both under adapter-node, and in development via the
 *   `load-env.js` preload.
 *
 * Reading only the first and last happened to work, because Compose and
 * `load-env.js` both populate `process.env`, but that made resolution depend
 * on one of those running rather than on consulting the correct source.
 */
function cfg(...names) {
  for (const name of names) {
    const value = env[name] ?? publicEnv[name] ?? process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/**
 * Current OIDC configuration, read fresh each call so runtime environment
 * changes take effect without a rebuild.
 * @returns {Object} - Resolved OIDC settings
 */
export function getOidcConfig() {
  // An install configured purely through the legacy AUTHENTIK_* names is an
  // upgrade from a pre-1.3 version, so keep its login button reading
  // "Login with Authentik" rather than silently relabelling it.
  const usingLegacyNames =
    !cfg("OIDC_CLIENT_ID") &&
    !cfg("OIDC_ISSUER_URL", "OIDC_ISSUER") &&
    !!cfg("AUTHENTIK_CLIENT_ID");

  return {
    clientId: cfg("OIDC_CLIENT_ID", "AUTHENTIK_CLIENT_ID"),
    clientSecret: cfg("OIDC_CLIENT_SECRET", "AUTHENTIK_CLIENT_SECRET"),
    issuer: cfg("OIDC_ISSUER_URL", "OIDC_ISSUER", "AUTHENTIK_ISSUER"),
    redirectUri: cfg("OIDC_REDIRECT_URI"),
    scopes: cfg("OIDC_SCOPES") || "openid email profile",
    // Shown on the login button. Defaults to a provider-neutral label, except
    // for legacy Authentik installs (above), which keep theirs.
    providerName:
      cfg("OIDC_PROVIDER_NAME") || (usingLegacyNames ? "Authentik" : "SSO"),
    // Manual endpoint overrides for providers without a discovery document.
    authUrl: cfg("OIDC_AUTH_URL", "OIDC_AUTHORIZATION_URL"),
    tokenUrl: cfg("OIDC_TOKEN_URL"),
    userinfoUrl: cfg("OIDC_USERINFO_URL"),
    endSessionUrl: cfg("OIDC_END_SESSION_URL"),
    jwksUri: cfg("OIDC_JWKS_URI"),
    // Claim carrying group membership. Non-standard, and the name varies by
    // provider (Authentik and Keycloak both use "groups"; others differ).
    groupsClaim: cfg("OIDC_GROUPS_CLAIM") || "groups",
  };
}

/**
 * Warn when a configured URL is not absolute.
 *
 * A value such as `192.0.2.10:5174/api/auth/callback` (the scheme omitted)
 * flows through to the authorization request unchanged, and the only feedback is
 * the provider's generic "missing, invalid, or mismatching redirection URI".
 * Naming the variable and the offending value turns that into a one-line fix.
 *
 * Warn rather than throw: an operator whose unusual-but-working value trips this
 * check must not be locked out of their own login by a diagnostic.
 *
 * @param {string} name - Environment variable the value came from
 * @param {string} value - Configured value
 * @param {string} example - A correctly formed example
 */
function warnIfNotAbsoluteUrl(name, value, example) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.warn(
      `⚠️ ${name} is not an absolute URL: "${value}". It is sent to the identity ` +
        `provider as-is and will be rejected. Expected something like "${example}".`,
    );
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.warn(
      `⚠️ ${name} uses an unsupported scheme "${parsed.protocol}": "${value}". ` +
        `Expected something like "${example}".`,
    );
  }
}

/**
 * Resolve the redirect URI to send to the provider.
 *
 * This must match what is registered at the IdP exactly. `url.origin` alone is
 * unreliable under adapter-node: with no ORIGIN/PROTOCOL_HEADER configured it
 * assumes https, so a plain-http deployment would advertise an https callback
 * and the provider would reject the request as a redirect_uri mismatch.
 *
 * Precedence: explicit OIDC_REDIRECT_URI, then PUBLIC_SITE_URL, then the
 * request origin.
 *
 * @param {URL} requestUrl - The incoming request URL
 * @returns {string} - Absolute callback URL
 */
export function resolveRedirectUri(requestUrl) {
  const explicit = cfg("OIDC_REDIRECT_URI");
  if (explicit) {
    warnIfNotAbsoluteUrl(
      "OIDC_REDIRECT_URI",
      explicit,
      "https://example.com/api/auth/callback",
    );
    return explicit;
  }

  const siteUrl = cfg("PUBLIC_SITE_URL");
  if (siteUrl) {
    warnIfNotAbsoluteUrl("PUBLIC_SITE_URL", siteUrl, "https://example.com");
    return `${siteUrl.replace(/\/+$/, "")}/api/auth/callback`;
  }

  return `${requestUrl.origin}/api/auth/callback`;
}

/**
 * Whether enough is configured to attempt an OIDC login.
 * @returns {boolean}
 */
export function isOidcConfigured() {
  const c = getOidcConfig();
  if (!c.clientId || !c.clientSecret) return false;
  // Either a discoverable issuer, or a full set of manual endpoints.
  return !!(c.issuer || (c.authUrl && c.tokenUrl));
}

let discoveryCache = { url: null, doc: null, fetchedAt: 0 };

/**
 * Fetch and cache the provider's discovery document.
 *
 * Note the issuer path is preserved. Authentik issuers look like
 * `https://auth.example.com/application/o/my-app`, and the discovery document
 * lives beneath that path; the previous implementation stripped it.
 *
 * @returns {Promise<Object|null>} - Discovery document, or null if unavailable
 */
async function getDiscoveryDocument() {
  const { issuer } = getOidcConfig();
  if (!issuer) return null;

  const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

  if (
    discoveryCache.doc &&
    discoveryCache.url === url &&
    Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return discoveryCache.doc;
  }

  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { accept: "application/json" } },
      IDP_TIMEOUT_MS,
    );

    if (!response.ok) {
      console.warn(
        `⚠️ OIDC discovery failed: ${response.status} ${response.statusText} (${url})`,
      );
      return discoveryCache.url === url ? discoveryCache.doc : null;
    }

    const doc = await response.json();
    discoveryCache = { url, doc, fetchedAt: Date.now() };
    return doc;
  } catch (error) {
    console.warn(`⚠️ OIDC discovery unreachable (${url}): ${error.message}`);
    // Serve a stale document rather than failing login outright.
    return discoveryCache.url === url ? discoveryCache.doc : null;
  }
}

/**
 * Resolve the provider's endpoints, preferring explicit overrides.
 * @returns {Promise<Object>} - `{ authorization, token, userinfo, jwks, endSession, issuer }`
 */
export async function getEndpoints() {
  const c = getOidcConfig();
  const doc = await getDiscoveryDocument();

  const endpoints = {
    authorization: c.authUrl || doc?.authorization_endpoint,
    token: c.tokenUrl || doc?.token_endpoint,
    userinfo: c.userinfoUrl || doc?.userinfo_endpoint,
    jwks: c.jwksUri || doc?.jwks_uri,
    endSession: c.endSessionUrl || doc?.end_session_endpoint,
    issuer: doc?.issuer || c.issuer,
  };

  if (!endpoints.authorization || !endpoints.token) {
    throw new Error(
      "OIDC endpoints could not be resolved. Set OIDC_ISSUER_URL to a provider " +
        "publishing /.well-known/openid-configuration, or set OIDC_AUTH_URL and " +
        "OIDC_TOKEN_URL explicitly.",
    );
  }

  return endpoints;
}

/**
 * Build the authorization URL to redirect the user to.
 * @param {string} redirectUri - Callback URL
 * @param {string} state - CSRF state value
 * @param {string} nonce - Replay-protection nonce, echoed in the id_token
 * @returns {Promise<string>} - Authorization URL
 */
export async function getAuthorizationUrl(redirectUri, state, nonce) {
  const c = getOidcConfig();
  if (!c.clientId) {
    throw new Error(
      "OIDC_CLIENT_ID (or AUTHENTIK_CLIENT_ID) is not configured",
    );
  }

  const { authorization } = await getEndpoints();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: c.redirectUri || redirectUri,
    scope: c.scopes,
    state,
  });

  if (nonce) params.set("nonce", nonce);

  const separator = authorization.includes("?") ? "&" : "?";
  return `${authorization}${separator}${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 * @param {string} code - Authorization code
 * @param {string} redirectUri - The redirect URI used in the auth request
 * @returns {Promise<Object>} - Token response
 */
export async function exchangeCodeForTokens(code, redirectUri) {
  const c = getOidcConfig();
  const { token } = await getEndpoints();

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code,
    redirect_uri: c.redirectUri || redirectUri,
  });

  const response = await fetchWithTimeout(
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    },
    IDP_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `❌ OIDC token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return response.json();
}

let jwksCache = { uri: null, jwks: null };

/**
 * Verify an id_token against the provider's published keys.
 *
 * The previous implementation never read the id_token at all; identity came
 * from an unverified /userinfo response.
 *
 * @param {string} idToken - Raw id_token
 * @param {string} nonce - Expected nonce, if one was sent
 * @returns {Promise<Object|null>} - Verified claims, or null if unverifiable
 */
export async function verifyIdToken(idToken, nonce) {
  if (!idToken) return null;

  const c = getOidcConfig();
  const endpoints = await getEndpoints();

  if (!endpoints.jwks) {
    console.warn(
      "⚠️ OIDC provider exposes no jwks_uri; id_token cannot be verified. " +
        "Set OIDC_JWKS_URI to enable verification.",
    );
    return null;
  }

  if (!jwksCache.jwks || jwksCache.uri !== endpoints.jwks) {
    // createRemoteJWKSet handles its own key caching and rotation.
    jwksCache = {
      uri: endpoints.jwks,
      jwks: createRemoteJWKSet(new URL(endpoints.jwks), {
        timeoutDuration: IDP_TIMEOUT_MS,
      }),
    };
  }

  try {
    const { payload } = await jwtVerify(idToken, jwksCache.jwks, {
      audience: c.clientId,
      ...(endpoints.issuer ? { issuer: endpoints.issuer } : {}),
    });

    if (nonce && payload.nonce && payload.nonce !== nonce) {
      console.error("❌ OIDC id_token nonce mismatch");
      return null;
    }

    return payload;
  } catch (error) {
    console.error(`❌ OIDC id_token verification failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch the userinfo endpoint.
 * @param {string} accessToken - Access token
 * @returns {Promise<Object|null>} - User claims, or null if unavailable
 */
export async function getUserInfo(accessToken) {
  const { userinfo } = await getEndpoints();
  if (!userinfo) return null;

  const response = await fetchWithTimeout(
    userinfo,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    IDP_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Build the identity used by the rest of the app from the available sources.
 *
 * Prefers verified id_token claims, falling back to /userinfo. Providers vary
 * in which claims they place where, so the two are merged with the verified
 * token taking precedence.
 *
 * @param {Object} tokens - Token response from the provider
 * @param {string} nonce - Nonce sent in the auth request
 * @returns {Promise<Object|null>} - Normalized user info
 */
export async function resolveIdentity(tokens, nonce) {
  const c = getOidcConfig();

  const verified = await verifyIdToken(tokens.id_token, nonce);

  let userinfo = null;
  if (tokens.access_token) {
    try {
      userinfo = await getUserInfo(tokens.access_token);
    } catch (error) {
      console.warn(`⚠️ OIDC userinfo request failed: ${error.message}`);
    }
  }

  // If the id_token could not be verified but is present, fall back to its
  // unverified claims only when there is no userinfo at all: better a
  // degraded login than none, but say so loudly.
  let claims = verified;
  if (!claims && !userinfo && tokens.id_token) {
    try {
      claims = decodeJwt(tokens.id_token);
      console.warn(
        "⚠️ Using UNVERIFIED id_token claims: no JWKS available and no userinfo endpoint.",
      );
    } catch {
      claims = null;
    }
  }

  const merged = { ...(userinfo || {}), ...(claims || {}) };
  if (!merged.sub) return null;

  const groups = merged[c.groupsClaim];

  return {
    sub: merged.sub,
    email: merged.email || null,
    name: merged.name || merged.preferred_username || merged.email || null,
    preferred_username: merged.preferred_username || null,
    picture: merged.picture || merged.avatar_url || null,
    // Undefined (not []) when the provider does not emit the claim at all, so
    // callers can tell "no groups" apart from "this provider has no groups".
    groups: Array.isArray(groups) ? groups : undefined,
    raw: merged,
  };
}

/**
 * Provider logout URL, when the provider supports RP-initiated logout.
 * @param {string} idToken - id_token, used as a logout hint
 * @param {string} postLogoutRedirect - Where to return afterwards
 * @returns {Promise<string|null>} - End-session URL, or null if unsupported
 */
export async function getEndSessionUrl(idToken, postLogoutRedirect) {
  try {
    const { endSession } = await getEndpoints();
    if (!endSession) return null;

    const params = new URLSearchParams();
    if (idToken) params.set("id_token_hint", idToken);
    if (postLogoutRedirect) {
      params.set("post_logout_redirect_uri", postLogoutRedirect);
    }

    const query = params.toString();
    if (!query) return endSession;

    return `${endSession}${endSession.includes("?") ? "&" : "?"}${query}`;
  } catch {
    return null;
  }
}
