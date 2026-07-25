# OIDC / SSO Setup

G.G Requestz authenticates against any standards-compliant OpenID Connect
provider. Endpoints are discovered from the provider's
`/.well-known/openid-configuration` document, so an issuer URL, a client ID and
a client secret are usually all you need.

> **Changed in v1.3.** Earlier versions only worked with Authentik: endpoint
> paths were hardcoded to Authentik's `/application/o/…` scheme, and the
> `OIDC_*` variables this guide previously documented were **not read by any
> code**. Setting `AUTH_METHOD=oidc_generic` produced "No authentication
> methods are configured" — issues
> [#4](https://github.com/XTREEMMAK/ggrequestz/issues/4) and
> [#7](https://github.com/XTREEMMAK/ggrequestz/issues/7). Both are fixed, and
> the flow is now verified end to end against Keycloak.
>
> **Existing Authentik installs need no changes** — the `AUTHENTIK_*` variables
> are still accepted as aliases.

## Supported providers

Any OIDC-compliant provider: Keycloak, Pocket ID, Authentik, Auth0, Okta,
Microsoft Entra ID, Google, AWS Cognito, and others.

---

## Quick start

```env
AUTH_METHOD=oidc

OIDC_ISSUER_URL=https://id.example.com/realms/main
OIDC_CLIENT_ID=ggrequestz
OIDC_CLIENT_SECRET=<your client secret>

# Label on the login button — renders as "Login with Keycloak"
OIDC_PROVIDER_NAME=Keycloak

# Recommended; see "Redirect URI" below
OIDC_REDIRECT_URI=https://requests.example.com/api/auth/callback

SESSION_SECRET=<openssl rand -hex 32>
```

Register `https://requests.example.com/api/auth/callback` as a valid redirect
URI at your provider.

---

## All variables

| Variable             | Required    | Description                                                                                         |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `AUTH_METHOD`        | yes         | `oidc`, `oidc_generic` and `authentik` all select OIDC. `basic` selects local username/password.    |
| `OIDC_CLIENT_ID`     | yes         | Client / application ID                                                                             |
| `OIDC_CLIENT_SECRET` | yes         | Client secret                                                                                       |
| `OIDC_ISSUER_URL`    | yes\*       | Issuer URL; discovery is read from `<issuer>/.well-known/openid-configuration`                      |
| `OIDC_REDIRECT_URI`  | recommended | Callback URL — see below                                                                            |
| `OIDC_PROVIDER_NAME` | no          | Login button label. Default `SSO`.                                                                  |
| `OIDC_SCOPES`        | no          | Default `openid email profile`. Add `groups` if your provider requires it to emit group membership. |
| `OIDC_GROUPS_CLAIM`  | no          | Claim carrying group membership. Default `groups`.                                                  |
| `OIDC_ROLE_MAP`      | no          | Comma-separated `group:role` pairs. Roles: `admin`, `manager`, `viewer`.                            |
| `OIDC_ADMIN_GROUP`   | no          | Shorthand for mapping one group to `admin`.                                                         |
| `SESSION_SECRET`     | yes         | Signs session cookies. **The app refuses to start without it.**                                     |

\* Not required if `OIDC_AUTH_URL` and `OIDC_TOKEN_URL` are both set manually.

### Manual endpoints (providers without discovery)

```env
OIDC_AUTH_URL=https://id.example.com/authorize
OIDC_TOKEN_URL=https://id.example.com/api/oidc/token
OIDC_USERINFO_URL=https://id.example.com/api/oidc/userinfo
OIDC_JWKS_URI=https://id.example.com/.well-known/jwks.json
OIDC_END_SESSION_URL=https://id.example.com/logout
```

Manual values override discovery, so a single wrong published endpoint can be
corrected without abandoning discovery entirely.

> Without `OIDC_JWKS_URI` (or a discoverable `jwks_uri`) the `id_token` cannot
> be cryptographically verified. The app falls back to the `/userinfo` response
> and logs a warning. Provide JWKS where possible.

### Redirect URI

Resolved in this order:

1. `OIDC_REDIRECT_URI`
2. `PUBLIC_SITE_URL` + `/api/auth/callback`
3. The incoming request's origin

Set one of the first two. The third is unreliable: behind a reverse proxy the
app cannot always tell whether it is served over HTTP or HTTPS, and advertising
the wrong scheme causes the provider to reject the request as a redirect URI
mismatch.

---

## Roles and groups

Group membership is optional. If your provider sends no groups claim, each
user's roles and admin flag are left **exactly as an administrator set them
locally**, and a warning is logged once per login.

> Before v1.3 an absent groups claim was treated as "member of no groups",
> which silently cleared `is_admin` on every login. Keycloak, among others,
> does not send `groups` without an explicit mapper — so this affected a lot of
> non-Authentik setups.

To drive roles from the provider:

```env
OIDC_SCOPES=openid email profile groups
OIDC_GROUPS_CLAIM=groups
OIDC_ROLE_MAP=platform-admins:admin,platform-staff:manager,platform-users:viewer
```

The first user to log in always becomes an admin.

Default mapping when `OIDC_ROLE_MAP` is unset (unchanged from earlier
versions): `gg-requestz-admins` → admin, `gg-requestz-managers` → manager,
`gg-requestz-users` → viewer.

---

## Provider examples

### Keycloak

```env
AUTH_METHOD=oidc
OIDC_ISSUER_URL=https://id.example.com/realms/main
OIDC_CLIENT_ID=ggrequestz
OIDC_CLIENT_SECRET=<secret>
OIDC_PROVIDER_NAME=Keycloak
OIDC_REDIRECT_URI=https://requests.example.com/api/auth/callback
```

Create a confidential client (Client authentication **on**) with the Standard
flow enabled and the redirect URI registered. For role mapping, add a "Group
Membership" mapper named `groups` to the client's dedicated scope — Keycloak
does not emit one by default.

### Pocket ID

```env
AUTH_METHOD=oidc
OIDC_ISSUER_URL=https://pocketid.example.com
OIDC_CLIENT_ID=ggrequestz
OIDC_CLIENT_SECRET=<secret>
OIDC_PROVIDER_NAME=Pocket ID
OIDC_REDIRECT_URI=https://requests.example.com/api/auth/callback
```

Pocket ID publishes a discovery document, so the explicit `OIDC_AUTH_URL` /
`OIDC_TOKEN_URL` / `OIDC_USERINFO_URL` values from older versions of this guide
are no longer needed. They still work if you prefer to set them.

### Authentik

Existing installs need no changes. For a new one:

```env
AUTH_METHOD=oidc
OIDC_ISSUER_URL=https://auth.example.com/application/o/ggrequestz
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<client secret>
OIDC_PROVIDER_NAME=Authentik
OIDC_REDIRECT_URI=https://requests.example.com/api/auth/callback
```

The issuer includes the application slug. Earlier versions discarded that path
segment; it is now preserved and used for discovery.

`AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` and `AUTHENTIK_ISSUER` remain
supported as aliases for the three `OIDC_*` equivalents.

### Auth0 / Okta / Entra ID

```env
AUTH_METHOD=oidc
# Auth0:    https://<tenant>.auth0.com
# Okta:     https://<domain>.okta.com
# Entra ID: https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_ISSUER_URL=<issuer>
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<secret>
OIDC_REDIRECT_URI=https://requests.example.com/api/auth/callback
```

---

## Troubleshooting

**"No authentication methods are configured"**
`OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` must both be set, plus either
`OIDC_ISSUER_URL` or both `OIDC_AUTH_URL` and `OIDC_TOKEN_URL`. As of v1.3 this
message no longer appears merely because you chose `AUTH_METHOD=oidc_generic`.

**Provider rejects the redirect URI**
Set `OIDC_REDIRECT_URI` to exactly what is registered at the provider,
including scheme. Mismatches are usually a http/https difference introduced by
a reverse proxy.

**"OIDC endpoints could not be resolved"**
Discovery failed. Confirm `<OIDC_ISSUER_URL>/.well-known/openid-configuration`
is reachable **from inside the container** — an issuer that resolves on your
laptop may not resolve there.

**Admin status keeps resetting**
Fixed in v1.3. If it persists, the provider is sending an _empty_ groups claim
rather than none; either populate it or point `OIDC_GROUPS_CLAIM` at the
correct claim.

**Server refuses to start: `SESSION_SECRET is required`**
Intentional as of v1.3. It previously fell back to a placeholder value
published in this repository, which made session cookies forgeable. Generate
one with `openssl rand -hex 32`.

**Basic-auth users were logged out after upgrading**
Expected. Basic-auth session tokens are now signed; previously they were
unsigned and could be forged to grant admin. Existing cookies are rejected and
users log in again once.
