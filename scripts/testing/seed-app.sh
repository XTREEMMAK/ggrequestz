#!/usr/bin/env bash
#
# Seed the local G.G Requestz test instance into a known state.
#
# Creates:
#   - the initial basic-auth admin, through the app's own first-run setup
#     endpoint, so the password is hashed and the admin role assigned exactly
#     the way a real installation does it
#
# The stack is disposable (`make test-down` deletes its volumes), so this runs
# after every rebuild. Passwords are bcrypt and cannot be read back out, which
# is why the credentials live here rather than in someone's memory.
#
# Usage:
#   ./scripts/testing/seed-app.sh [base-url]
#
# The base URL must match the app's configured ORIGIN. svelte.config.js sets
# checkOrigin: true, so a POST whose Origin header disagrees with ORIGIN is
# rejected before it reaches any handler. If you started the stack with
# GGR_TEST_ORIGIN_HOST set, pass the same host here.
#
# Requires the stack to be running:
#   docker compose -f docker-compose.test.yml up -d

set -euo pipefail

GGR_URL="${1:-http://127.0.0.1:${GGR_TEST_PORT:-3100}}"

ADMIN_USER="admin"
ADMIN_MAIL="admin@example.test"
ADMIN_PASS="ggr-test-admin"

say() { printf '%s\n' "$*" >&2; }

# --------------------------------------------------------------------------
# The app answers /api/health before the database is necessarily reachable, and
# docker-entrypoint.js runs migrations on boot. Wait for the database to report
# healthy rather than for the port to open, or the setup call races the schema.
db_status() {
  curl -s "${GGR_URL}/api/health" 2>/dev/null |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["services"]["database"])' 2>/dev/null || true
}

say "Waiting for the app at ${GGR_URL} ..."
for _ in $(seq 1 60); do
  if [ "$(db_status)" = "healthy" ]; then break; fi
  sleep 3
done
[ "$(db_status)" = "healthy" ] || {
  say "ERROR: the app did not become ready at ${GGR_URL}"
  say "       check: docker compose -f docker-compose.test.yml logs app"
  exit 1
}
say "App is up, database healthy."

# --------------------------------------------------------------------------
# POST /api/auth/basic/setup is unauthenticated but guarded by
# needsInitialSetup(), so it succeeds exactly once per volume. A 400 on the
# second run is the expected already-seeded response, not a failure.
say "Creating initial admin '${ADMIN_USER}' ..."
SETUP_RESULT="$(curl -s -X POST "${GGR_URL}/api/auth/basic/setup" \
  -H "Origin: ${GGR_URL}" \
  -F "username=${ADMIN_USER}" \
  -F "email=${ADMIN_MAIL}" \
  -F "password=${ADMIN_PASS}" || true)"

if printf '%s' "$SETUP_RESULT" | grep -q '"success"'; then
  say "  created."
elif printf '%s' "$SETUP_RESULT" | grep -qi 'already'; then
  say "  already exists; leaving it alone."
elif printf '%s' "$SETUP_RESULT" | grep -qi 'cross-site'; then
  say "ERROR: the app rejected the request as cross-site."
  say "       Its ORIGIN does not match ${GGR_URL}. Check what the container has:"
  say "         docker compose -f docker-compose.test.yml exec app printenv ORIGIN"
  say "       then re-run this script with that URL as its first argument."
  exit 1
else
  say "  WARNING: unexpected response from the setup endpoint:"
  say "  ${SETUP_RESULT}"
fi

# --------------------------------------------------------------------------
# Prove the account is actually loginable. If an admin was left behind by an
# earlier run with a different password this is the only thing that catches it.
# Check the response body, not the cookie: the endpoint marks the session cookie
# Secure whenever NODE_ENV=production, so over plain http it is never stored.
say "Verifying the login ..."
LOGIN_RESULT="$(curl -s -X POST "${GGR_URL}/api/auth/basic/login" \
  -H "Origin: ${GGR_URL}" \
  -F "username=${ADMIN_USER}" \
  -F "password=${ADMIN_PASS}" || true)"

if printf '%s' "$LOGIN_RESULT" | grep -q '"success"'; then
  say "  ok."
else
  say "ERROR: '${ADMIN_USER}' could not log in with the seeded password."
  say "       Response: ${LOGIN_RESULT}"
  say "       An admin already exists with a different password. Either reset it"
  say "       (see docs/setup/TESTING.md) or start clean with 'make test-down'."
  exit 1
fi

# --------------------------------------------------------------------------
cat <<EOF

App fixture ready (${GGR_URL})

  admin  ${ADMIN_USER} / ${ADMIN_PASS}   (${ADMIN_MAIL})

Sign in at ${GGR_URL}/login with AUTH_METHOD=basic, which is the default for
this stack. The OIDC and Authentik paths are seeded separately; see
./scripts/testing/seed-keycloak.sh.

The password is bcrypt cost-12 and unrecoverable. To change it, hash a new one
inside the app container and update the row directly; docs/setup/TESTING.md has
the exact commands.
EOF
