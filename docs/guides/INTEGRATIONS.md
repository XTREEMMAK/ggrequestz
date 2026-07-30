# Integrations

G.G Requestz talks to three optional external services: **ROMM** for library
cross-referencing, **Gotify** for push notifications, and **n8n** for webhook
automation. All three are off unless configured, and the app runs without any
of them.

Authentication providers are **not** covered here — see
[OIDC_SETUP.md](../setup/OIDC_SETUP.md).

> **Changed in v1.3.** Earlier versions of this guide described `AUTH_PROVIDER`,
> an `api_integration` provider, a `webhook_integration` provider, and an
> `/admin/integrations` configuration screen backed by `/api/integrations/*`
> endpoints. **None of that exists.** The variable is `AUTH_METHOD`, there is no
> integrations admin page, and those routes were never implemented. Everything
> below is configured through environment variables only.

---

## ROMM

Cross-references requested games against your ROMM library, shows availability
on game pages, and links out to play them.

**`LIBRARY_*` is the current, documented name for these settings.** `ROMM_*` is
honoured as a fallback so an existing install needs no changes — the same
trade `REQUEST_WEBHOOK_URL` made with `N8N_WEBHOOK_URL`. `LIBRARY_*` wins when
both are set. `LIBRARY_KIND` additionally selects the backend (`romm` is the
default; `gaseous` and `retrom` are recognized but not yet implemented).

```env
LIBRARY_URL=http://romm:8080
LIBRARY_API_TOKEN=<client api token with roms.read>
```

| Variable                                        | Description                                                     |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `LIBRARY_URL` / `ROMM_SERVER_URL`               | Server-side API base. Prefer an internal hostname               |
| `LIBRARY_PUBLIC_URL` / `ROMM_SERVER_URL_PUBLIC` | Browser-facing base for links and covers. Defaults to the above |
| `LIBRARY_API_TOKEN` / `ROMM_API_TOKEN`          | Client API Token, RomM 5.0+ — **recommended**                   |
| `LIBRARY_USERNAME` / `ROMM_USERNAME`            | Password-grant fallback for RomM 4.x                            |
| `LIBRARY_PASSWORD` / `ROMM_PASSWORD`            | Password-grant fallback for RomM 4.x                            |
| `LIBRARY_KIND`                                  | Backend selector: `romm` (default), `gaseous`, `retrom`         |

Include the scheme in the URL. `romm:8080` without `http://` will not resolve.

### Use a Client API Token

On RomM 5.0+, issue a Client API Token carrying the **`roms.read`** scope and
set `ROMM_API_TOKEN`. It does not expire and avoids storing a password.

`ROMM_USERNAME` / `ROMM_PASSWORD` still work as a fallback for RomM 4.x, where
the app requests a token from `/api/token` with `scope=roms.read`.

Either way, **the account behind the credential must hold `roms.read`.** RomM
issues a token containing only the scopes the account actually has, so an
under-privileged account authenticates successfully and then gets a 403 on
every library request afterwards.

### Two URLs, when the browser can't reach ROMM

`ROMM_SERVER_URL` is used for server-side API calls, where an internal address
is the right choice — it avoids hairpinning out through DNS, TLS and your
reverse proxy just to come back in. But that address is not usable as a link.

If the library list renders correctly while "Play in ROMM" links and cover
images are broken, this is why. Set the browser-facing URL separately:

```env
ROMM_SERVER_URL=http://romm.media.svc:8080      # server-side API calls
ROMM_SERVER_URL_PUBLIC=https://romm.example.com # links and cover images
```

`ROMM_SERVER_URL_PUBLIC` defaults to `ROMM_SERVER_URL`, so leave it unset when
the app and your users reach ROMM at the same address. Kubernetes service
names, Docker network aliases and VPN-only private IPs all need the split.

### Testing the connection

```bash
curl -X POST http://your-ggrequestz-host/api/setup/check \
  -H "Content-Type: application/json" \
  -d '{"service": "romm_library"}'
```

`{"success": true}` means the app authenticated and read the library.
`database_connection`, `redis_cache` and `igdb_api` are also valid values.

To check RomM directly, bypassing the app:

```bash
# 4.x password grant — note the scope
curl -X POST http://romm:8080/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=USER&password=PASS&scope=roms.read"

# With a Client API Token
curl -H "Authorization: Bearer $ROMM_API_TOKEN" \
     "http://romm:8080/api/platforms?size=1"
```

### ROMM troubleshooting

**`403 {"detail":"Insufficient scope"}` from `/api/token`**
The account lacks `roms.read`, so no token is issued at all — authentication
fails outright rather than succeeding and failing later. Grant the account's
group library read access in the ROMM admin UI, or issue a Client API Token
that carries the scope. The app logs this case explicitly.

**A token is issued but every library call returns 403**
RomM returned a token whose granted scopes exclude `roms.read`. The app checks
the token's scopes on receipt and logs which ones were actually granted.

**Roles**: ROMM's "Viewer" cannot reach the API. "Editor" or "Admin" can.

**Connection refused**
Check the scheme is present in `ROMM_SERVER_URL`, and that the address resolves
_from inside the app container_ — not from your laptop.

**Library section missing entirely**
It only appears when a server URL is set (`LIBRARY_URL` or `ROMM_SERVER_URL`)
along with either an API token (`LIBRARY_API_TOKEN` or `ROMM_API_TOKEN`) or
both a username and password (`LIBRARY_USERNAME`/`LIBRARY_PASSWORD` or
`ROMM_USERNAME`/`ROMM_PASSWORD`). A partial configuration disables it
silently.

### Library fields on a game

A cross-referenced game carries `in_library`, and when it is in the library
also `library_id` and `library_url`. A RomM-native card — as returned by the
recently-added, search and by-id endpoints — additionally carries
`is_library_game`.

`is_in_romm`, `is_romm_game`, `romm_id` and `romm_url` are the **deprecated**
aliases, kept because Svelte components still read them — `is_romm_game`
alone in seven component branches — and will be removed in a future major
release. Migrate a reader from `is_romm_game || is_in_romm` to
`is_library_game || in_library`: the neutral pair covers every case the
deprecated pair does, since `in_library` is set by both producers even where
`is_library_game` is only set on RomM-native cards.

Most deprecated fields are populated with the same value as their neutral
counterpart — **with one deliberate exception**: `library_id` is a **string**
and `romm_id` stays a **number**. Every id in the library seam is
stringified, matching `LibraryEntry.id` and the `TEXT` column a later
cross-reference-by-index phase will use, so `library_id` cannot revert to
RomM's numeric id without silently changing type the day that phase lands.
`romm_id` keeps the numeric type it has always had instead. Do not "fix"
these two to match each other — a test comment says so in exactly those
words.

---

## Gotify

Push notifications for new requests, status changes and admin alerts.

```env
GOTIFY_URL=https://gotify.example.com
GOTIFY_TOKEN=<application token>
```

Both are required; notifications are skipped if either is missing. Create an
**application** in Gotify (not a client) and use its token.

---

## Outbound request webhook

Posts request events to any URL that accepts JSON. n8n is one receiver; so is a
download automation service, a script, or a chat bridge.

```env
REQUEST_WEBHOOK_URL=https://automation.example.com/hook/ggrequestz
```

`N8N_WEBHOOK_URL` is still honoured as a deprecated alias, so existing installs
need no change. When both are set, `REQUEST_WEBHOOK_URL` wins.

Submitting a request dispatches one. Failures are logged and never block the
submission — by the time the webhook is sent the request is already saved, so a
receiver that is slow, rejecting or absent cannot cost a user their request.
Receivers get five seconds to respond.

### Payload

```json
{
  "type": "game_request",
  "title": "New Game Request: Chrono Trigger",
  "message": "alice requested \"Chrono Trigger\"",
  "priority": 5,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": {
    "request_id": "eac1cd44-5f6e-4f49-8ac1-9936066105a6",
    "user_id": "12",
    "game_title": "Chrono Trigger",
    "igdb_id": "1234",
    "platforms": ["Super Nintendo"],
    "request_type": "game"
  }
}
```

`data.game_title` and `data.platforms` are what a receiver needs to act on a
request. `igdb_id` identifies the title unambiguously where the receiver also
speaks IGDB.

`request_id` is a UUID; `user_id` and `igdb_id` are strings, matching how they
are stored. `platforms` is always an array, empty when the requester named no
platform. `request_type` is `game`, `update` or `fix`.

`priority` maps the request's own priority onto a 1-10 scale: `low` 3,
`medium` 5, `high` 8, `urgent` 9.

---

## General troubleshooting

**Check the logs first.** Server-side `console` output is deliberately retained
in production builds, so integration failures — a ROMM 403, a Gotify timeout —
are visible in `docker compose logs ggrequestz` and generally say exactly what
went wrong.

**Every outbound call has a hard timeout.** An unreachable integration degrades
the page rather than hanging it. If something is slow rather than broken, the
timeout is what you are seeing.

**Verify the variable reached the container**, which is a more common problem
than it sounds:

```bash
docker compose exec ggrequestz env | grep -E "ROMM|GOTIFY|N8N"
```

**Useful queries:**

```sql
SELECT * FROM ggr_activity_log ORDER BY created_at DESC LIMIT 20;
SELECT * FROM ggr_system_settings WHERE key LIKE '%romm%';
```
