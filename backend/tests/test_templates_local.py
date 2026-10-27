"""Local (draft) template creation through the API."""
from tests.inbox_fixtures import InboxTestCase


class LocalTemplateTests(InboxTestCase):
    def head(self):
        return self.auth(self.owner, self.tenant_a)

    def test_create_local_draft_template(self):
        r = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "welcome_offer",
            "language": "en_US",
            "category": "MARKETING",
            "body_text": "Hi {{1}}, welcome!",
            "footer_text": "Reply STOP to opt out",
            "buttons": ["Shop now", "Talk to us"],
        })
        self.assertEqual(r.status_code, 201, r.text)
        body = r.json()
        self.assertEqual(body["status"], "draft")
        self.assertFalse(body["is_usable"])
        self.assertTrue(any(c.get("type") == "BODY" for c in body["components"]))

        # Appears in the tenant-wide list.
        listed = self.client.get("/api/v1/templates", headers=self.head()).json()
        self.assertTrue(any(t["name"] == "welcome_offer" for t in listed["items"]))

    def test_create_local_media_header_draft(self):
        response = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "invoice_video",
            "language": "en_US",
            "category": "UTILITY",
            "header_format": "VIDEO",
            "body_text": "Your update is ready.",
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertIn(
            {"type": "HEADER", "format": "VIDEO"},
            response.json()["components"],
        )

    def test_duplicate_name_language_rejected(self):
        payload = {
            "channel_connection_id": str(self.wa_a.id),
            "name": "dup_tpl", "language": "en_US", "body_text": "Hello",
        }
        self.assertEqual(self.client.post("/api/v1/templates", headers=self.head(), json=payload).status_code, 201)
        self.assertEqual(self.client.post("/api/v1/templates", headers=self.head(), json=payload).status_code, 409)

    def test_cross_tenant_channel_rejected(self):
        r = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_b.id),  # tenant B's channel
            "name": "sneaky", "language": "en_US", "body_text": "Hi",
        })
        self.assertEqual(r.status_code, 404, r.text)

    def test_patch_local_draft_template(self):
        created = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "draft_to_edit",
            "language": "en_US",
            "category": "UTILITY",
            "body_text": "Original body",
        }).json()
        template_id = created["id"]

        patch_resp = self.client.patch(f"/api/v1/templates/{template_id}", headers=self.head(), json={
            "body_text": "Updated body with {{1}}",
            "footer_text": "Updated footer",
        })
        self.assertEqual(patch_resp.status_code, 200, patch_resp.text)
        updated = patch_resp.json()
        self.assertEqual(updated["status"], "draft")
        body_comp = next((c for c in updated["components"] if c.get("type") == "BODY"), None)
        self.assertIsNotNone(body_comp)
        self.assertIn("Updated body", body_comp.get("text", ""))

    def test_delete_local_draft_template(self):
        created = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "draft_to_delete",
            "language": "en_US",
            "category": "UTILITY",
            "body_text": "Delete me",
        }).json()
        template_id = created["id"]

        del_resp = self.client.delete(f"/api/v1/templates/{template_id}", headers=self.head())
        self.assertEqual(del_resp.status_code, 200, del_resp.text)
        self.assertTrue(del_resp.json()["success"])

        # Fetching it now returns 404
        get_resp = self.client.get(f"/api/v1/templates/{template_id}", headers=self.head())
        self.assertEqual(get_resp.status_code, 404)

    def test_delete_cross_tenant_rejected(self):
        # Tenant A creates a template
        created = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "tenant_a_private",
            "language": "en_US",
            "category": "UTILITY",
            "body_text": "Private",
        }).json()
        template_id = created["id"]

        # Tenant B tries to delete Tenant A's template
        head_b = self.auth(self.owner, self.tenant_b)
        del_resp = self.client.delete(f"/api/v1/templates/{template_id}", headers=head_b)
        self.assertIn(del_resp.status_code, (403, 404))

    def test_create_with_typed_buttons(self):
        r = self.client.post("/api/v1/templates", headers=self.head(), json={
            "channel_connection_id": str(self.wa_a.id),
            "name": "rich_buttons_tpl",
            "language": "en_US",
            "category": "MARKETING",
            "body_text": "Special offer for you!",
            "buttons": [
                {"type": "QUICK_REPLY", "text": "Interested"},
                {"type": "URL", "text": "Visit Site", "url": "https://example.com/shop"},
                {"type": "PHONE_NUMBER", "text": "Call Support", "phone_number": "+1234567890"},
            ],
        })
        self.assertEqual(r.status_code, 201, r.text)
        tpl = r.json()
        btn_comp = next((c for c in tpl["components"] if c.get("type") == "BUTTONS"), None)
        self.assertIsNotNone(btn_comp)
        self.assertEqual(len(btn_comp.get("buttons", [])), 3)
