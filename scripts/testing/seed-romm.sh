#!/usr/bin/env bash
#
# Seed the local RomM test fixture into a known state.
#
# Creates:
#   - an admin account with full scopes
#   - a Client API Token carrying roms.read (the RomM 5.0+ recommended auth)
#   - an under-privileged account with roms.read REVOKED, which reproduces the
#     exact failure that made the library silently disappear
#
# Prints the environment variables to feed back into docker-compose.test.yml.
#
# Usage:
#   ./scripts/testing/seed-romm.sh [base-url]
#
# Requires the romm profile to be running:
#   docker compose -f docker-compose.test.yml --profile romm up -d

set -euo pipefail

ROMM_URL="${1:-http://127.0.0.1:${ROMM_TEST_PORT:-8090}}"

ADMIN_USER="ggradmin"
ADMIN_PASS="GgrTest123!"
LOW_USER="lowpriv"
LOW_PASS="LowTest123!"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

say() { printf '%s\n' "$*" >&2; }

# --------------------------------------------------------------------------
say "Waiting for RomM at ${ROMM_URL} ..."
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "${ROMM_URL}/api/heartbeat"; then break; fi
  sleep 3
done
curl -sf -o /dev/null "${ROMM_URL}/api/heartbeat" || {
  say "ERROR: RomM did not become ready at ${ROMM_URL}"
  exit 1
}

VERSION="$(curl -s "${ROMM_URL}/api/heartbeat" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["SYSTEM"]["VERSION"])')"
say "RomM ${VERSION} is up."

# --------------------------------------------------------------------------
# RomM enforces CSRF on writes: fetch the romm_csrftoken cookie first and echo
# it back in an x-csrftoken header. The first admin can be created without
# authentication only while the setup wizard is still active.
say "Creating admin user '${ADMIN_USER}' ..."
curl -s -c "$COOKIE_JAR" -o /dev/null "${ROMM_URL}/api/heartbeat"
CSRF="$(awk '/romm_csrftoken/ {print $7}' "$COOKIE_JAR")"

ADMIN_RESULT="$(curl -s -b "$COOKIE_JAR" \
  -H "Content-Type: application/json" -H "x-csrftoken: ${CSRF}" \
  -X POST "${ROMM_URL}/api/users" \
  -d "{\"username\":\"${ADMIN_USER}\",\"email\":\"${ADMIN_USER}@example.test\",\"password\":\"${ADMIN_PASS}\",\"role\":\"admin\"}" || true)"

if printf '%s' "$ADMIN_RESULT" | grep -q '"id"'; then
  say "  created."
else
  say "  already exists (or setup wizard closed); continuing."
fi

# --------------------------------------------------------------------------
token_for() { # username password scopes
  curl -s -X POST "${ROMM_URL}/api/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "username=$1" \
    --data-urlencode "password=$2" \
    --data-urlencode "scope=$3" |
    python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true
}

ADMIN_TOKEN="$(token_for "$ADMIN_USER" "$ADMIN_PASS" "me.read me.write users.read users.write roms.read")"
[ -n "$ADMIN_TOKEN" ] || {
  say "ERROR: could not authenticate as ${ADMIN_USER}"
  exit 1
}

# --------------------------------------------------------------------------
say "Creating Client API Token with roms.read ..."
CLIENT_TOKEN="$(curl -s -X POST "${ROMM_URL}/api/client-tokens" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d '{"name":"ggrequestz-test","scopes":["roms.read"]}' |
  python3 -c 'import sys,json;print(json.load(sys.stdin).get("raw_token",""))' 2>/dev/null || true)"

if [ -n "$CLIENT_TOKEN" ]; then
  say "  issued (shown once by RomM, captured below)."
else
  say "  WARNING: token creation failed; falling back to password auth."
fi

# --------------------------------------------------------------------------
# The under-privileged account. Note that role alone is not enough: RomM coerces
# "viewer" to "user" and that role still carries roms.read. The scope has to be
# revoked through the 5.0 permission-override API.
say "Creating under-privileged user '${LOW_USER}' with roms.read revoked ..."
LOW_ID="$(curl -s -X POST "${ROMM_URL}/api/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"username\":\"${LOW_USER}\",\"email\":\"${LOW_USER}@example.test\",\"password\":\"${LOW_PASS}\",\"role\":\"viewer\"}" |
  python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)"

if [ -z "$LOW_ID" ]; then
  LOW_ID="$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" "${ROMM_URL}/api/users" |
    python3 -c "
import sys,json
for u in json.load(sys.stdin):
    if u.get('username')=='${LOW_USER}': print(u['id']); break
" 2>/dev/null || true)"
fi

if [ -n "$LOW_ID" ]; then
  curl -s -o /dev/null -X PUT "${ROMM_URL}/api/permissions/users/${LOW_ID}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" \
    -d '{"overrides":[{"entity":"roms","action":"read","granted":false}]}'
  say "  user ${LOW_ID}: roms.read revoked."
else
  say "  WARNING: could not resolve ${LOW_USER}; skipping revocation."
fi

# --------------------------------------------------------------------------
cat <<EOF

RomM fixture ready (${ROMM_URL})

  admin     ${ADMIN_USER} / ${ADMIN_PASS}
  low-priv  ${LOW_USER} / ${LOW_PASS}   (roms.read revoked)

--- healthy: Client API Token (recommended path) -------------------------
ROMM_SERVER_URL=http://romm:8080
ROMM_API_TOKEN=${CLIENT_TOKEN:-<token creation failed>}

--- healthy: password grant (RomM 4.x compatibility path) ----------------
ROMM_SERVER_URL=http://romm:8080
ROMM_USERNAME=${ADMIN_USER}
ROMM_PASSWORD=${ADMIN_PASS}

--- broken: reproduces the 403 "Insufficient scope" outage ---------------
ROMM_SERVER_URL=http://romm:8080
ROMM_USERNAME=${LOW_USER}
ROMM_PASSWORD=${LOW_PASS}

Note the INTERNAL hostname (romm:8080). A public URL would hairpin out
through DNS, TLS and the reverse proxy and back, the exact cost v1.3
removed from the render path.
EOF
