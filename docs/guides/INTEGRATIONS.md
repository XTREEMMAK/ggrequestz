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

A request dispatches when it enters `approved`, and only then. With
`request.auto_approve` enabled — as a global setting or a per-role permission —
requests are approved on submission, so the webhook fires immediately and
behaves as it did before approval gating. With it disabled, nothing is
dispatched until an admin approves, which is what makes the approval queue
meaningful.

Note that **any `is_admin` user auto-approves unconditionally**, regardless of
the global setting and without holding `request.auto_approve`: admins bypass
permission checks entirely. Their own requests therefore never sit in the
queue, and dispatch on submission. That is independent of both switches — if
you want an admin's requests to be reviewed, they need a non-admin account.

Re-opening a fulfilled request dispatches again, since the game needs fetching
a second time. That re-dispatch is marked in the payload — see
[Re-dispatch](#re-dispatch) — because it carries the same `request_id` as the
first one.

Failures are logged and never block the transition that triggered them,
whether that is a submission or an admin approval. By the time the webhook is
sent the row is already committed, so a receiver that is slow, rejecting or
absent cannot cost a user their request or leave an approval half-applied.
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

### Re-dispatch

`type` is always `game_request` and `request_id` is always the same for a given
request, including when it is approved a second time. A re-dispatch adds two
keys inside `data`:

```json
{
  "data": {
    "request_id": "eac1cd44-5f6e-4f49-8ac1-9936066105a6",
    "redispatch": true,
    "previous_status": "fulfilled"
  }
}
```

A first dispatch carries neither key, so nothing changes for a receiver that
does not look for them.

**A receiver that deduplicates on `request_id` alone must also consider
`redispatch`**, or it will silently drop the re-fetch — the request is
re-approved, the operator is told it dispatched, and nothing arrives. Dedupe on
the pair instead, or treat `redispatch: true` as a cache-buster.

`previous_status` is the status the request left: `fulfilled` for the documented
re-open, `rejected` or `cancelled` for a request being re-opened out of those
states. One case is not detectable and carries no marker: approving, demoting
to `pending`, then approving again dispatches twice, and the second dispatch is
indistinguishable from a first.

### Duplicate suppression is best-effort

One open request per game is the intent — `status IN ('pending','approved')`,
matched on `igdb_id` when present and on the normalised title when it is not —
so two people wanting the same game produce one request and one dispatch. A
submission that loses to it gets `409` with the existing request's id, and an
admin re-opening a request into a game that is already open gets `409` too.

It is a suppression, not a guarantee, and it will not save you from a double
download on its own:

- The two backing indexes are partitioned on whether `igdb_id` is null, which
  makes them **different keys**. A request carrying an `igdb_id` and one
  carrying none can both be open for the same title, and both dispatch.
  `igdb_id` is client-supplied, so this is reachable deliberately as well as by
  accident.
- Matching is exact after lowercasing and trimming. "Chrono Trigger" and
  "Chrono Trigger (USA)" are different keys.
- `rejected`, `cancelled` and `fulfilled` requests deliberately do not block a
  new one, so a game can legitimately be requested and fetched again.

If duplicate fetches are expensive for your receiver, deduplicate on your own
side using `data.igdb_id` and `data.game_title` rather than relying on this.

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
