# Prompt for the website/plugin project

Paste this into Codex while the website project is open. This is the integration
contract for the existing Omniflow Channels flow; Omniflow does not edit the
website project or install the plugin remotely.

```text
Connect this website's existing Omniflow plugin settings to the user-panel
pairing flow in Omniflow. Preserve the current admin permissions, plugin database,
widget styling, old chatbot source/history and unrelated website behavior.

The protocol is "omniflow-pairing-v1". Customers enter only their website name
and URL in Omniflow, then authorize here. Do not require frontend/backend URLs,
public keys, source-code edits or a rebuild for each customer connection.

1. Add a public route /omniflow/connect on the customer website. It receives
   public query parameters origin (the exact Omniflow opener origin) and request_id
   (a UUID). Validate both, require window.opener, and reject unsupported protocols
   and malformed origins. Production requires HTTPS; local HTTP is dev-only.

2. Before navigating to your configured admin portal, send this from the WEBSITE
   origin to window.opener with targetOrigin set to the validated origin:
   {
     protocol: "omniflow-pairing-v1",
     type: "connector",
     request_id,
     authorization_origin: YOUR_CONFIGURED_ADMIN_ORIGIN
   }
   Wait for type "connector_ack" with matching protocol/request_id. Verify
   event.source === window.opener and event.origin === origin. Then navigate the
   SAME popup to your admin connection page. Carry origin, request_id and the
   original website_origin as public routing data. Never put a token in a URL.

3. Preserve that connection return path through admin login. Verify real admin
   identity and the existing plugin-management permission on the server.
   Do not weaken authorization or trust the role from browser storage.

4. From the authorized admin page, send:
   { protocol: "omniflow-pairing-v1", type: "ready", request_id }
   to the exact Omniflow opener origin. Retry the ready message while waiting.
   Accept configuration only from that exact origin and the same opener window,
   with matching protocol, request_id/pairing_id and original website_origin.

5. Omniflow sends type "configuration" with these fields:
   protocol, request_id, pairing_id, channel_id, channel_name, website_origin,
   frontend_url, backend_url, public_key, token, expires_at.
   The request expires after ten minutes. Check all required values and expiry.
   Keep the token only in memory. Never log it or store it in browser storage,
   database, audit records, URL parameters or an ordinary backend request.

6. Show the website, requesting Omniflow origin and channel to the admin. Require
   an explicit "Authorize connection" action before replacing plugin settings.
   Use a browser GET, without admin credentials, to verify:
   {backend_url}/api/v1/web-chat/{public_key}/config
   Then save enabled=true, frontendUrl=frontend_url, backendUrl=backend_url and
   widgetKey=public_key through your EXISTING authenticated plugin settings API.
   Keep optimistic revision checks and audit redaction. Validate website_origin
   against this website's configured origin. Never fetch arbitrary entered URLs
   from the website backend. Do not execute the widget in the admin page.

7. After the settings save succeeds, the ADMIN BROWSER confirms directly:
   POST {backend_url}/api/v1/web-chat/pairings/{pairing_id}/complete
   Content-Type: application/json
   credentials: omit
   {
     "token": THE_IN_MEMORY_HANDOFF_TOKEN,
     "website_origin": ORIGINAL_WEBSITE_ORIGIN,
     "plugin_revision": SAVED_SETTINGS_REVISION
   }
   Do not append another /api/v1 to backend_url. If confirmation fails after the
   save, preserve the saved revision and offer Retry confirmation without saving
   a second time. Identical confirmations are safe to retry until expiry.

8. After confirmation succeeds, post to the exact opener origin:
   { protocol: "omniflow-pairing-v1", type: "saved", request_id }
   Omniflow independently checks server status before showing Authorized.
   Settings take effect on new/refreshed website pages using the existing loader.
   Authorization alone must not claim that a visitor message was delivered.

9. Handle sign-in expiry, missing permission, conflicting saves, blocked/closed
   popups, missing opener, expired requests and network failures with useful
   messages. Never accept messages using targetOrigin "*" or skip source checks.

Verify with a local fixture before production: unauthenticated and unauthorized
requests rejected; config stored only after approval; key/URLs not hardcoded;
conflict and retry work; no duplicate widget; visitor -> Omniflow Inbox -> agent
reply -> same website visitor. Report exactly what was verified and what remains.
```
