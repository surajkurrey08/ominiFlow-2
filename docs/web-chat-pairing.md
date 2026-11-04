# Website connection from Channels

Customers create a Web Chat channel with a name and website base URL. The next
screen immediately shows the generated **Public widget key**, **Frontend URL**
and **Backend URL**, with Copy buttons. Paste all three into the Omniflow plugin
in the website's live admin panel, enable chat, and save. Existing channels expose
the same values through **View plugin settings**, without rotating their key.
No `/omniflow/connect` route, authorization popup or website code change is
required when the website already has a working plugin settings panel.

For this installation the frontend and backend values are both
`https://fmfilms.in`, without `/api/v1`. The key must belong to the matching live
Omniflow channel, not a different channel or a separate local database.
After saving, refresh the website and send a visitor message. **Check chat
activity** becomes Active after a stored visitor message, even without pairing.
Reading/copying settings alone does not prove the plugin is installed.

`GET /api/v1/channels/{id}/web-chat/widget-settings` returns the platform URLs
and existing public key. It is tenant-scoped, requires `channel:read`, uses
`Cache-Control: no-store`, and does not create a handoff token or change settings.

## Platform configuration

Set `WEB_CHAT_PUBLIC_FRONTEND_URL` and `WEB_CHAT_PUBLIC_BACKEND_URL` once for the
Omniflow installation. The frontend falls back to `FRONTEND_URL`; the development
backend default is `http://localhost:8000`. Both are origins, without paths or
`/api/v1`. Live websites require public HTTPS services. Local configuration is
accepted only for local website testing. This workflow does not create hosting,
DNS or a tunnel. Run `alembic upgrade head` for the additive pairing table.

## Optional legacy browser protocol: omniflow-pairing-v1

These endpoints remain available for compatible integrations. The Channels UI
uses the manual plugin setup above and does not launch this protocol.

1. The authenticated dashboard creates a tenant-scoped, ten-minute handoff.
   Its random 256-bit token is returned once and stored only as a SHA-256 hash.
2. The dashboard opens `{website_origin}/omniflow/connect?origin=...&request_id=...`.
   These parameters are public routing data; no token or widget configuration
   travels in a URL, persistent browser storage or navigation history.
3. That website page sends `{protocol,type:'connector',request_id,
   authorization_origin}` to its exact opener origin. The dashboard checks both
   event source and the configured website origin, remembers the admin origin,
   and sends `connector_ack` to that exact website origin.
4. The page navigates the same popup to its configured website admin connector.
   After sign-in it sends `{protocol,type:'ready',request_id}`. The dashboard
   checks the same popup and the website-announced admin origin before sending
   the handoff payload with `type:'configuration'` and `request_id`.
5. The website admin shows the workspace origin, website and channel, and requires
   explicit **Authorize connection** with its existing plugin-management role.
   It probes Omniflow's public keyed config in the browser, then stores only the
   public configuration, pairing ID and normal audit metadata through its own API.
   The handoff token is never sent to or stored by the website backend.
6. The admin browser posts `{token,website_origin,plugin_revision}` without cookies
   or admin credentials to `/api/v1/web-chat/pairings/{id}/complete`. The server
   checks expiry, hash, website and current channel state under row locks.
   Identical confirmation retries are idempotent; they cannot change a revision.
7. The dashboard polls authenticated installation status. A popup message alone
   never marks a channel authorized. No server fetches an arbitrary customer URL,
   so customer-controlled DNS does not create an SSRF path.

Cancel targets a specific pairing ID, so an older tab cannot cancel a newer
request. Restart invalidates older pending handoffs. Disconnect/delete blocks completion
and message routing while preserving history. Changing an approved channel to a
different website requires a separate channel, not silent reassignment. Cancelling
a handoff does not undo website settings that its admin has already saved.

## Status meaning

- Ready / not connected: channel key exists; no visitor message has been received.
- Awaiting approval / expired: handoff exists, but is pending or needs a restart.
- Authorized: website admin completed the save/confirmation flow. This is a
  browser-mediated administrative receipt, not DNS ownership verification or a
  guarantee of script availability.
- Active: a visitor message was actually stored. Manual setup requires no pairing;
  a legacy authorized installation uses activity after its last authorization.
- Disconnected: Omniflow no longer routes this channel. Website settings remain
  under that website's own administrator; no remote admin credential is retained.

Existing public widget keys, conversations and manual embeds keep working. AI and
old chatbot history are not migrated. For another website, create a separate channel and copy its key into that
website's plugin settings. Each website needs a compatible widget loader once.

Optional legacy connector instructions for the website's coding agent are in
[`website-plugin-prompt.md`](website-plugin-prompt.md). That work belongs to the
website/plugin project and is not performed by Omniflow automatically.

## Verification

Manual setup: 30 backend setup/widget tests and 10 channel proxy checks passed.
The production build and targeted new-code lint passed. Isolated browser checks
covered creation, clipboard and clipboard denial, URL and activity failures,
retry, reopening with the same key, Escape/focus, four viewports down to 320px,
and actual widget/Inbox UI replies using synthetic APIs. No popup or pairing
request was made. This does not claim a live customer message round-trip.

Earlier legacy pairing verification:

- `cd backend && .venv/Scripts/python.exe -m unittest tests.test_web_chat_pairing tests.test_web_chat -q`: 24 tests passed. The PostgreSQL harness rolls back all fixtures.
- `cd frontend && npm run test:channels`: 9 tests passed.
- Production build and TypeScript passed. Targeted ESLint has no errors; four existing Channels warnings remain.
- The strict static audit of the new dialog, pairing utilities, channel browser/proxy helpers and shared AppDialog has no findings. This is a scoped audit, not a whole-project compliance claim.
- An isolated browser fixture exercised creation validation, failed-save retry, blocked popup, public-URL configuration errors, cross-origin website/admin handoff, explicit approval, server status polling, cancellation, expiry, Escape/focus restoration and four viewport sizes down to 320px.
- The actual Omniflow widget and Inbox UI exchanged visitor messages and agent replies through synthetic test APIs. No real customer conversations were created by browser verification.

Actual live website/plugin installation and a production message round-trip are
not claimed by these checks. They require the compatible website connector and
reachable platform HTTPS addresses.
