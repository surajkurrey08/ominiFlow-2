"""Website pairing against PostgreSQL, always rolled back by InboxTestCase."""
from datetime import timedelta
import hashlib
import uuid

from app.core.config import settings
from app.models import ChannelConnection, WebChatPairing
from app.services.web_chat_pairing_service import normalize_origin, PairingError, utcnow
from tests.inbox_fixtures import InboxTestCase


class WebsitePairingTests(InboxTestCase):
    def setUp(self):
        super().setUp()
        self.saved_settings = {key: getattr(settings, key) for key in (
            "frontend_url", "frontend_origins", "web_chat_public_frontend_url", "web_chat_public_backend_url", "app_env",
        )}
        settings.frontend_url = "http://localhost:3000"
        settings.frontend_origins = ""
        settings.web_chat_public_frontend_url = ""
        settings.web_chat_public_backend_url = "http://localhost:8000"
        settings.app_env = "development"

    def tearDown(self):
        for key, value in self.saved_settings.items():
            setattr(settings, key, value)
        super().tearDown()

    def setup_site(self, website="http://localhost:5173"):
        response = self.client.post("/api/v1/channels/web-chat/setup", headers=self.auth(self.owner, self.tenant_a),
                                    json={"name": "BookMyVilla", "website_url": website})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def start_pairing(self, channel):
        return self.client.post(f"/api/v1/channels/{channel['id']}/web-chat/pairing", headers=self.auth(self.owner, self.tenant_a),
                                json={"opener_origin": "http://localhost:3000"})

    def complete(self, pairing, **overrides):
        return self.client.post(f"/api/v1/web-chat/pairings/{pairing['pairing_id']}/complete", json={
            "token": pairing["token"], "website_origin": pairing["website_origin"], "plugin_revision": 1, **overrides,
        })

    def installation(self, channel):
        return self.client.get(f"/api/v1/channels/{channel['id']}/web-chat/installation", headers=self.auth(self.owner, self.tenant_a)).json()

    def test_setup_preserves_website_and_generates_distinct_keys(self):
        a, b = self.setup_site(), self.setup_site("http://localhost:5175")
        self.assertNotEqual(a["external_account_id"], b["external_account_id"])
        self.assertEqual(a["provider_metadata"]["web_chat"]["website_origin"], "http://localhost:5173")
        self.assertEqual(self.installation(a)["installation_status"], "not_connected")

    def test_manual_settings_are_stable_and_do_not_start_authorization(self):
        channel = self.setup_site()
        path = f"/api/v1/channels/{channel['id']}/web-chat/widget-settings"
        before = self.db.query(WebChatPairing).count()
        for _ in range(2):
            response = self.client.get(path, headers=self.auth(self.owner, self.tenant_a))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.headers.get("cache-control"), "no-store")
            self.assertEqual(response.json(), {
                "channel_id": channel["id"], "frontend_url": "http://localhost:3000",
                "backend_url": "http://localhost:8000", "public_key": channel["external_account_id"],
            })
        self.assertEqual(self.db.query(WebChatPairing).count(), before)
        self.assertIsNone(self.installation(channel)["pairing_id"])

    def test_manual_settings_require_auth_and_tenant_ownership(self):
        channel = self.setup_site()
        path = f"/api/v1/channels/{channel['id']}/web-chat/widget-settings"
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get(path, headers=self.auth(self.owner_b, self.tenant_b)).status_code, 404)

    def test_manual_live_settings_require_public_urls_without_api_prefix(self):
        channel = self.setup_site("https://bookmyvilla.online")
        path = f"/api/v1/channels/{channel['id']}/web-chat/widget-settings"
        headers = self.auth(self.owner, self.tenant_a)
        self.assertEqual(self.client.get(path, headers=headers).status_code, 422)
        settings.web_chat_public_frontend_url = "https://fmfilms.in/"
        settings.web_chat_public_backend_url = "https://fmfilms.in/"
        response = self.client.get(path, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["frontend_url"], "https://fmfilms.in")
        self.assertEqual(response.json()["backend_url"], "https://fmfilms.in")
        settings.web_chat_public_backend_url = "https://fmfilms.in/api/v1"
        self.assertEqual(self.client.get(path, headers=headers).status_code, 422)

    def test_manual_visitor_delivery_is_active_without_pairing(self):
        channel = self.setup_site()
        self.assertEqual(self.installation(channel)["installation_status"], "not_connected")
        message = self.client.post(f"/api/v1/web-chat/{channel['external_account_id']}/messages",
                                   json={"visitor_id": "manual-plugin-visitor", "text": "Hello from my website"})
        self.assertEqual(message.status_code, 201, message.text)
        status = self.installation(channel)
        self.assertEqual(status["installation_status"], "active")
        self.assertIsNone(status["paired_at"])
        self.assertIsNone(status["pairing_id"])

    def test_old_popup_request_does_not_hide_manual_visitor_delivery(self):
        channel = self.setup_site()
        self.assertEqual(self.start_pairing(channel).status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/web-chat/{channel['external_account_id']}/messages",
                                         json={"visitor_id": "manual-after-popup", "text": "Hello"}).status_code, 201)
        self.assertEqual(self.installation(channel)["installation_status"], "active")

    def test_setup_and_handoff_are_permission_and_tenant_scoped(self):
        self.assertEqual(self.client.post("/api/v1/channels/web-chat/setup", headers=self.auth(self.viewer, self.tenant_a), json={"name": "Site", "website_url": "http://localhost:5173"}).status_code, 403)
        channel = self.setup_site()
        path = f"/api/v1/channels/{channel['id']}/web-chat"
        self.assertEqual(self.client.get(path + "/installation", headers=self.auth(self.owner_b, self.tenant_b)).status_code, 404)
        self.assertEqual(self.client.post(path + "/pairing", headers=self.auth(self.owner_b, self.tenant_b), json={"opener_origin": "http://localhost:3000"}).status_code, 404)
        self.assertEqual(self.client.post(path + "/pairing", headers=self.auth(self.viewer, self.tenant_a), json={"opener_origin": "http://localhost:3000"}).status_code, 403)

    def test_handoff_uses_platform_config_and_hashes_token(self):
        channel = self.setup_site()
        response = self.start_pairing(channel)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(response.headers.get("cache-control"), "no-store")
        self.assertEqual(body["frontend_url"], "http://localhost:3000")
        self.assertEqual(body["backend_url"], "http://localhost:8000")
        self.assertNotIn(body["token"], body["authorization_url"])
        self.db.expire_all()
        row = self.db.get(WebChatPairing, uuid.UUID(body["pairing_id"]))
        self.assertEqual(row.token_hash, hashlib.sha256(body["token"].encode()).hexdigest())
        self.assertEqual(self.installation(channel)["installation_status"], "awaiting_approval")
        detail = self.client.get(f"/api/v1/channels/{channel['id']}", headers=self.auth(self.owner, self.tenant_a)).json()
        self.assertNotIn(body["token"], str(detail))

    def test_wrong_origin_and_wrong_token_cannot_complete(self):
        pairing = self.start_pairing(self.setup_site()).json()
        self.assertEqual(self.complete(pairing, token="x" * 43).status_code, 403)
        self.assertEqual(self.complete(pairing, website_origin="https://someone-else.com").status_code, 403)

    def test_approval_is_idempotent_and_does_not_claim_message_delivery(self):
        channel = self.setup_site()
        pairing = self.start_pairing(channel).json()
        self.assertEqual(self.complete(pairing).status_code, 200)
        self.assertEqual(self.complete(pairing).status_code, 200)
        self.assertEqual(self.complete(pairing, plugin_revision=2).status_code, 409)
        status = self.installation(channel)
        self.assertEqual(status["installation_status"], "authorized")
        self.assertIsNone(status["last_visitor_message_at"])
        self.assertEqual(self.client.post(f"/api/v1/web-chat/{channel['external_account_id']}/messages", json={"visitor_id": "pairing-test-visitor", "text": "Hello"}).status_code, 201)
        self.assertEqual(self.installation(channel)["installation_status"], "active")

    def test_cancel_and_restart_invalidate_old_handoffs(self):
        channel = self.setup_site()
        first = self.start_pairing(channel).json()
        self.client.post(f"/api/v1/channels/{channel['id']}/web-chat/pairing/cancel", headers=self.auth(self.owner, self.tenant_a), json={"pairing_id": first["pairing_id"]})
        self.assertEqual(self.complete(first).status_code, 409)
        second = self.start_pairing(channel).json()
        third = self.start_pairing(channel).json()
        self.assertEqual(self.complete(second).status_code, 409)
        self.assertEqual(self.complete(third).status_code, 200)

    def test_expired_handoffs_are_rejected(self):
        channel = self.setup_site()
        pairing = self.start_pairing(channel).json()
        row = self.db.get(WebChatPairing, uuid.UUID(pairing["pairing_id"]))
        row.expires_at = utcnow() - timedelta(seconds=1)
        self.db.commit()
        self.assertEqual(self.complete(pairing).status_code, 409)
        self.assertEqual(self.installation(channel)["installation_status"], "expired")

    def test_old_window_cancellation_does_not_cancel_a_newer_request(self):
        channel = self.setup_site()
        first = self.start_pairing(channel).json()
        second = self.start_pairing(channel).json()
        cancelled = self.client.post(f"/api/v1/channels/{channel['id']}/web-chat/pairing/cancel", headers=self.auth(self.owner, self.tenant_a), json={"pairing_id": first["pairing_id"]})
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["pairing_id"], second["pairing_id"])
        self.assertEqual(cancelled.json()["installation_status"], "awaiting_approval")
        self.assertEqual(self.complete(second).status_code, 200)

    def test_channel_disconnect_prevents_completion(self):
        channel = self.setup_site()
        pairing = self.start_pairing(channel).json()
        self.client.post(f"/api/v1/channels/{channel['id']}/disconnect", headers=self.auth(self.owner, self.tenant_a))
        self.assertEqual(self.complete(pairing).status_code, 409)
        self.assertEqual(self.installation(channel)["installation_status"], "disconnected")

    def test_existing_channels_keep_their_public_key(self):
        channel = self.setup_site()
        saved = self.client.patch(f"/api/v1/channels/{channel['id']}/web-chat/website", headers=self.auth(self.owner, self.tenant_a),
                                  json={"name": "Website two", "website_url": "http://localhost:5175"})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["external_account_id"], channel["external_account_id"])

    def test_live_sites_do_not_receive_local_platform_urls(self):
        channel = self.setup_site("https://bookmyvilla.online")
        self.assertEqual(self.start_pairing(channel).status_code, 422)
        settings.web_chat_public_frontend_url = "https://chat.bookmyvilla.online"
        settings.web_chat_public_backend_url = "https://chat-api.bookmyvilla.online"
        response = self.start_pairing(channel)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["backend_url"], settings.web_chat_public_backend_url)

    def test_changing_pending_website_invalidates_the_old_request(self):
        channel = self.setup_site()
        pairing = self.start_pairing(channel).json()
        changed = self.client.patch(f"/api/v1/channels/{channel['id']}/web-chat/website", headers=self.auth(self.owner, self.tenant_a),
                                   json={"name": "Another site", "website_url": "http://localhost:5175"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.complete(pairing).status_code, 409)

    def test_authorized_channel_cannot_be_silently_reassigned(self):
        channel = self.setup_site()
        pairing = self.start_pairing(channel).json()
        self.assertEqual(self.complete(pairing).status_code, 200)
        changed = self.client.patch(f"/api/v1/channels/{channel['id']}/web-chat/website", headers=self.auth(self.owner, self.tenant_a),
                                   json={"name": "Another site", "website_url": "http://localhost:5175"})
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(self.installation(channel)["website_url"], "http://localhost:5173")

    def test_public_completion_preflight_allows_a_website_admin_origin(self):
        response = self.client.options(f"/api/v1/web-chat/pairings/{uuid.uuid4()}/complete", headers={
            "Origin": "https://admin.bookmyvilla.online", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "*")
        self.assertNotIn("access-control-allow-credentials", response.headers)

    def test_spoofed_opener_and_extra_private_fields_are_rejected(self):
        channel = self.setup_site()
        self.assertEqual(self.client.post(f"/api/v1/channels/{channel['id']}/web-chat/pairing", headers=self.auth(self.owner, self.tenant_a), json={"opener_origin": "https://attacker.com"}).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/channels/web-chat/setup", headers=self.auth(self.owner, self.tenant_a), json={"name": "Website", "website_url": "http://localhost:5173", "tenant_id": str(self.tenant_b.id)}).status_code, 422)

    def test_url_validation(self):
        for value in ["javascript:alert(1)", "https://user:pass@site.com", "https://site.com/path", "https://site.com?key=secret", "https://site.com/#fragment", "http://site.com", "https://localhost", "https://127.0.0.1", "https://192.168.1.1"]:
            with self.assertRaises(PairingError, msg=value):
                normalize_origin(value, production=True)
        self.assertEqual(normalize_origin("https://BOOKMYVILLA.online:443/", production=True), "https://bookmyvilla.online")
