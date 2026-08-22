#!/usr/bin/env bash
#
# Seed the local Keycloak fixture with a confidential OIDC client and a test
# user, for exercising the generic OIDC path against a provider that is NOT
# Authentik.
#
# Keycloak's endpoints (/realms/{r}/protocol/openid-connect/auth) share nothing
# with Authentik's (/application/o/authorize/), which makes it a good check that
# nothing has quietly become provider-specific again.
#
# Usage:
#   ./scripts/testing/seed-keycloak.sh [base-url] [ggr-url]
#
# Requires the oidc profile to be running:
#   docker compose -f docker-compose.test.yml --profile oidc up -d

set -euo pipefail

KC_URL="${1:-http://127.0.0.1:${KEYCLOAK_TEST_PORT:-8091}}"
GGR_URL="${2:-http://127.0.0.1:${GGR_TEST_PORT:-3100}}"

REALM="master"
CLIENT_ID="ggrequestz"
CLIENT_SECRET="ggr-test-secret"
TEST_USER="ggruser"
TEST_PASS="UserPass123!"

say() { printf '%s\n' "$*" >&2; }

# --------------------------------------------------------------------------
say "Waiting for Keycloak at ${KC_URL} ..."
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "${KC_URL}/realms/${REALM}/.well-known/openid-configuration"; then break; fi
  sleep 3
done
curl -sf -o /dev/null "${KC_URL}/realms/${REALM}/.well-known/openid-configuration" || {
  say "ERROR: Keycloak did not become ready at ${KC_URL}"
  exit 1
}
say "Keycloak is up."

ADMIN_TOKEN="$(curl -s -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=admin&grant_type=password" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')"

# --------------------------------------------------------------------------
say "Creating confidential client '${CLIENT_ID}' ..."
curl -s -o /dev/null -X POST "${KC_URL}/admin/realms/${REALM}/clients" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{
    \"clientId\":\"${CLIENT_ID}\",\"enabled\":true,\"protocol\":\"openid-connect\",
    \"publicClient\":false,\"secret\":\"${CLIENT_SECRET}\",
    \"standardFlowEnabled\":true,\"directAccessGrantsEnabled\":true,
    \"redirectUris\":[\"${GGR_URL}/*\"],\"webOrigins\":[\"*\"]
  }" || true

say "Creating user '${TEST_USER}' ..."
curl -s -o /dev/null -X POST "${KC_URL}/admin/realms/${REALM}/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{
    \"username\":\"${TEST_USER}\",\"enabled\":true,\"emailVerified\":true,
    \"email\":\"${TEST_USER}@example.test\",\"firstName\":\"GGR\",\"lastName\":\"Tester\",
    \"credentials\":[{\"type\":\"password\",\"value\":\"${TEST_PASS}\",\"temporary\":false}]
  }" || true

# --------------------------------------------------------------------------
cat <<EOF

Keycloak fixture ready (${KC_URL})

  admin  admin / admin
  user   ${TEST_USER} / ${TEST_PASS}

--- generic OIDC config ---------------------------------------------------
AUTH_METHOD=oidc
OIDC_ISSUER_URL=http://keycloak:8080/realms/${REALM}
OIDC_CLIENT_ID=${CLIENT_ID}
OIDC_CLIENT_SECRET=${CLIENT_SECRET}
OIDC_PROVIDER_NAME=Keycloak
OIDC_REDIRECT_URI=${GGR_URL}/api/auth/callback

Two things worth knowing:

  * OIDC_ISSUER_URL uses the INTERNAL hostname (keycloak:8080) because the app
    resolves discovery server-side, while OIDC_REDIRECT_URI must use the URL the
    browser sees. They are different on purpose.

  * Keycloak does not emit a 'groups' claim without an explicit Group Membership
    mapper. That is the case v1.3 fixed: an absent claim no longer clears
    is_admin on every login. To test role mapping, add the mapper and set
    OIDC_SCOPES / OIDC_ROLE_MAP.
EOF
