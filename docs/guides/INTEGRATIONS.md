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
both are set. `LIBRARY_KIND` additionally selects the backend; `romm` is the
default and is what the rest of this section describes. Every other backend has
its own section below.

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

## Gaseous

Set `LIBRARY_KIND=gaseous` to point the library at a
[Gaseous](https://github.com/gaseous-project/gaseous-server) server instead of
RomM. Everything else on this page that is about ROMM specifically — the API
token, the two-URL split for covers — does not apply; what follows does.

```env
LIBRARY_KIND=gaseous
LIBRARY_URL=http://gaseous:5198
LIBRARY_USERNAME=you@example.com
LIBRARY_PASSWORD=<account password>
```

**Gaseous has no API token.** The account credentials are the only way in, so
`LIBRARY_USERNAME` and `LIBRARY_PASSWORD` are both required and
`LIBRARY_API_TOKEN` is ignored. Two things catch people out:

- `LIBRARY_USERNAME` must be the account's **e-mail address**, not its
  username. A bare username is rejected as a bad credential.
- The account must not have **two-factor authentication** enabled. There is no
  way for the app to supply a code, so a 2FA account fails the connection
  check with a message saying so rather than half-working.

### What Gaseous can and cannot answer

| Behaviour            | Gaseous                                                 |
| -------------------- | ------------------------------------------------------- |
| Recently added       | Yes, ordered by the server's own date-added             |
| Search               | **Prefix only** — see below                             |
| Cover images         | None. Gaseous exposes no working cover route for a game |
| File size and path   | Not reported. They belong to a ROM, not to a game       |
| Date added per entry | Not reported, though the server can sort by it          |

**Search matches a prefix, not a substring.** Searching `zelda` finds
_Zelda II_ but not _The Legend of Zelda_, because the match is anchored at the
start of the title. This is the server's behaviour, not a client limitation.

Turning the local library index on with `LIBRARY_SYNC_ENABLED=true` fixes it:
once a sync has completed, searches are answered from the index with a
substring match, and the anchoring goes away. The index is off by default, so
until it is enabled, prefix matching is what searching a Gaseous library does.
It is the single best reason to enable it for this backend.

### Cross-referencing against IGDB

GG Requestz marks a game as owned by matching IGDB ids. Gaseous only reports
one when the game was actually matched **against IGDB** — a game matched
against another metadata source, or not matched at all, reports no IGDB id and
so is never marked owned, even though it is in the library.

That is deliberate. The id Gaseous returns is the game's id _in whichever
source matched it_, so treating it as an IGDB id regardless would mark
unrelated games as owned. If your library shows fewer matches than you expect,
give Gaseous IGDB credentials and let it re-match, rather than looking for a
setting here.

---

## Retrom

`LIBRARY_KIND=retrom` is recognized but not yet implemented.

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
