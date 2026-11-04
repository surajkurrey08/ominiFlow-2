"""Channel configuration and actual Web Chat routing; all fixture rows roll back."""
import uuid

from app.models import Flow, Keyword, KeywordTrigger, TenantRoutingConfig, Message
from app.services import flow_engine, flow_runner
from tests.inbox_fixtures import InboxTestCase


class ChannelScopeTests(InboxTestCase):
    def head(self):
        return self.auth(self.owner, self.tenant_a)

    def site(self, name="Website"):
        r = self.client.post("/api/v1/channels/web-chat/setup", headers=self.head(),
                             json={"name": name, "website_url": "http://localhost:5173"})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def flow(self, channel, text="Channel-specific reply"):
        r = self.client.post("/api/v1/flows", headers=self.head(),
                             json={"name": "Scoped test flow", "channel_connection_id": channel["id"]})
        self.assertEqual(r.status_code, 201, r.text)
        f = r.json()
        r = self.client.patch(f"/api/v1/flows/{f['id']}", headers=self.head(), json={"nodes": [
            {"id": "start", "type": "message", "data": {"isStart": True, "messageType": "text", "message": text}},
        ]})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def keyword(self, channel, flow=None, text="hi"):
        r = self.client.post("/api/v1/keywords", headers=self.head(), json={
            "keyword_text": text, "match_type": "exact", "channel_connection_id": channel["id"],
            "flow_id": flow["id"] if flow else None, "reply_text": None if flow else "Text reply",
        })
        self.assertEqual(r.status_code, 201, r.text)
        self.db.expire_all()
        return r.json()

    def inbound(self, channel, text="hi"):
        r = self.client.post(f"/api/v1/web-chat/{channel['external_account_id']}/messages", json={
            "visitor_id": "scoped-fixture-visitor", "text": text,
        })
        self.assertEqual(r.status_code, 201, r.text)
        self.db.expire_all()
        return r.json()

    def test_flow_requires_specific_owned_channel(self):
        self.assertEqual(self.client.post("/api/v1/flows", headers=self.head(), json={"name": "Missing"}).status_code, 422)
        self.assertEqual(self.client.post("/api/v1/flows", headers=self.head(), json={"name": "Foreign", "channel_connection_id": str(self.wa_b.id)}).status_code, 404)
        channel = self.site()
        f = self.flow(channel)
        self.assertEqual(f["channel_connection_id"], channel["id"])
        self.assertEqual(f["channels"], ["web_chat"])
        clone = self.client.post(f"/api/v1/flows/{f['id']}/copy", headers=self.head())
        self.assertEqual(clone.status_code, 201, clone.text)
        self.assertEqual(clone.json()["channel_connection_id"], channel["id"])

    def test_keyword_requires_owned_channel_and_matching_flow(self):
        channel, other = self.site("Website A"), self.site("Website B")
        flow = self.flow(channel)
        base = {"keyword_text": "hi", "match_type": "exact", "flow_id": flow["id"]}
        self.assertEqual(self.client.post("/api/v1/keywords", headers=self.head(), json=base).status_code, 422)
        self.assertEqual(self.client.post("/api/v1/keywords", headers=self.head(), json={**base, "channel_connection_id": str(self.wa_b.id)}).status_code, 404)
        self.assertEqual(self.client.post("/api/v1/keywords", headers=self.head(), json={**base, "channel_connection_id": other["id"]}).status_code, 422)
        kw = self.keyword(channel, flow)
        self.assertEqual(self.client.patch(f"/api/v1/keywords/{kw['id']}", headers=self.head(), json={"channel_connection_id": other["id"]}).status_code, 422)
        self.assertEqual(self.client.patch(f"/api/v1/keywords/{kw['id']}", headers=self.head(), json={"channel_connection_id": None}).status_code, 422)

    def test_same_keyword_runs_different_flows_on_two_websites(self):
        a, b = self.site("Villa fixture"), self.site("Gym fixture")
        fa, fb = self.flow(a, "Villa details"), self.flow(b, "Gym details")
        ka, kb = self.keyword(a, fa), self.keyword(b, fb)
        self.inbound(a)
        self.inbound(b)
        self.assertEqual(self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).count(), 2)
        flow_runner.process_pending(self.db, 20)
        self.db.expire_all()
        for channel, expected, excluded in [(a, "Villa details", "Gym details"), (b, "Gym details", "Villa details")]:
            out = self.client.get(f"/api/v1/web-chat/{channel['external_account_id']}/messages?visitor_id=scoped-fixture-visitor")
            texts = [m.get("text") for m in out.json()["messages"]]
            self.assertIn(expected, texts)
            self.assertNotIn(excluded, texts)
        listed = self.client.get(f"/api/v1/keywords?channel_connection_id={a['id']}", headers=self.head()).json()
        self.assertIn(ka["id"], [k["id"] for k in listed])
        self.assertNotIn(kb["id"], [k["id"] for k in listed])

    def test_flow_picker_filter_and_tenant_checks(self):
        a, b = self.site("First site"), self.site("Second site")
        fa, fb = self.flow(a), self.flow(b)
        r = self.client.get(f"/api/v1/flows?channel_connection_id={a['id']}", headers=self.head())
        self.assertEqual([f["id"] for f in r.json()["items"]], [fa["id"]])
        self.assertNotEqual(fa["id"], fb["id"])
        self.assertEqual(self.client.get(f"/api/v1/flows?channel_connection_id={self.wa_b.id}", headers=self.head()).status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/keywords?channel_connection_id={self.wa_b.id}", headers=self.head()).status_code, 404)

    def test_legacy_global_keyword_does_not_reply_to_a_website(self):
        channel = self.site()
        self.db.add(Keyword(tenant_id=self.tenant_a.id, keyword_text="hi", match_type="exact", reply_text="Legacy PG info", is_active=True))
        self.db.commit()
        self.inbound(channel)
        self.assertEqual(self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).count(), 0)

    def test_global_fallback_does_not_fill_another_channels_missing_config(self):
        a, b = self.site("Default source"), self.site("Other website")
        flow = self.flow(a, "Wrong website details")
        self.db.add(TenantRoutingConfig(tenant_id=self.tenant_a.id, fallback_action="flow", fallback_flow_id=uuid.UUID(flow["id"])))
        self.db.commit()
        self.inbound(b, "unmatched")
        self.assertEqual(self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).count(), 0)
        config = self.client.get(f"/api/v1/routing-config?channel_connection_id={b['id']}", headers=self.head())
        self.assertEqual(config.json()["fallback_action"], "none")

    def test_channel_default_rejects_mismatch_and_runs_matching_flow(self):
        a, b = self.site("Default website"), self.site("Other site")
        flow = self.flow(a, "Correct default reply")
        body = {"fallback_action": "flow", "fallback_flow_id": flow["id"], "channel_connection_id": b["id"]}
        self.assertEqual(self.client.put("/api/v1/routing-config", headers=self.head(), json=body).status_code, 422)
        body["channel_connection_id"] = a["id"]
        self.assertEqual(self.client.put("/api/v1/routing-config", headers=self.head(), json=body).status_code, 200)
        self.inbound(a, "unmatched")
        self.assertEqual(self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).count(), 1)

    def test_old_mismatched_rule_is_rejected_again_at_runtime(self):
        a, b = self.site("Flow website"), self.site("Keyword website")
        flow = self.flow(a)
        self.db.add(Keyword(tenant_id=self.tenant_a.id, channel_connection_id=uuid.UUID(b["id"]),
                            keyword_text="hi", match_type="exact", flow_id=uuid.UUID(flow["id"]), is_active=True))
        self.db.commit()
        self.inbound(b)
        self.assertEqual(self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).count(), 0)

    def test_flow_cannot_be_reassigned_while_linked_to_another_channel(self):
        a, b = self.site("Original"), self.site("New target")
        flow = self.flow(a)
        self.keyword(a, flow)
        r = self.client.patch(f"/api/v1/flows/{flow['id']}", headers=self.head(), json={"channel_connection_id": b["id"]})
        self.assertEqual(r.status_code, 409, r.text)

    def test_unassigned_flow_is_preserved_but_cannot_be_activated(self):
        flow = Flow(tenant_id=self.tenant_a.id, name="Legacy content", channels=["omnichannel"], nodes=[], edges=[])
        self.db.add(flow)
        self.db.commit()
        r = self.client.patch(f"/api/v1/flows/{flow.id}", headers=self.head(), json={"status": "active"})
        self.assertEqual(r.status_code, 422)
        self.db.refresh(flow)
        self.assertEqual(flow.name, "Legacy content")
        self.assertIsNone(flow.channel_connection_id)

    def test_queued_trigger_is_blocked_after_keyword_scope_changes(self):
        a, b = self.site("Queued source"), self.site("Changed target")
        kw = self.keyword(a)
        self.inbound(a)
        r = self.client.patch(f"/api/v1/keywords/{kw['id']}", headers=self.head(), json={"channel_connection_id": b["id"]})
        self.assertEqual(r.status_code, 200, r.text)
        flow_runner.process_pending(self.db, 20)
        self.db.expire_all()
        trigger = self.db.query(KeywordTrigger).filter_by(tenant_id=self.tenant_a.id).one()
        self.assertEqual(trigger.status, "skipped")
        self.assertEqual(self.db.query(Message).filter_by(tenant_id=self.tenant_a.id, direction="outbound").count(), 0)

    def test_engine_refuses_cross_channel_flow_start(self):
        a, b = self.site("Engine source"), self.site("Engine target")
        f = self.flow(a)
        contact = self.make_contact(self.tenant_a)
        from app.models import ChannelConnection
        conversation = self.make_conversation(self.tenant_a, contact, self.db.get(ChannelConnection, uuid.UUID(b["id"])))
        self.assertIsNone(flow_engine.start_session(self.db, self.db.get(Flow, uuid.UUID(f["id"])), conversation, contact, self.owner.id))

    def test_waiting_flow_only_interrupts_for_its_own_channels_keyword(self):
        from app.models import FlowSession
        a, b = self.site("Waiting villa"), self.site("Other business")
        waiting = self.flow(a)
        self.client.patch(f"/api/v1/flows/{waiting['id']}", headers=self.head(), json={"nodes": [
            {"id": "start", "type": "message", "data": {"isStart": True, "messageType": "button", "message": "Choose a plan", "buttons": [{"id": "basic", "title": "Basic"}]}},
        ]})
        self.keyword(a, waiting, "start")
        self.keyword(b, self.flow(b, "Wrong business menu"), "menu")
        self.inbound(a, "start")
        flow_runner.process_pending(self.db, 20)
        current = self.db.query(FlowSession).filter_by(flow_id=uuid.UUID(waiting["id"])).one()
        self.assertEqual(current.status, "waiting")
        self.inbound(a, "menu")
        flow_engine.resume_pending_replies(self.db, 20)
        self.db.refresh(current)
        self.assertEqual(current.status, "waiting", f"Unexpected interruption: {current.detail}; nodes={current.nodes}")
        self.keyword(a, self.flow(a, "Correct villa menu"), "menu")
        self.inbound(a, "menu")
        flow_engine.resume_pending_replies(self.db, 20)
        self.db.refresh(current)
        self.assertEqual(current.status, "completed")
        texts = [m.text for m in self.db.query(Message).filter_by(tenant_id=self.tenant_a.id, direction="outbound").all()]
        self.assertIn("Correct villa menu", texts)
        self.assertNotIn("Wrong business menu", texts)

    def test_waiting_session_is_blocked_if_its_stored_flow_scope_is_invalid(self):
        from app.models import FlowSession
        a, b = self.site("Original session"), self.site("Invalid target")
        flow = self.flow(a)
        self.client.patch(f"/api/v1/flows/{flow['id']}", headers=self.head(), json={"nodes": [
            {"id": "start", "type": "message", "data": {"isStart": True, "messageType": "button", "message": "Choose", "buttons": [{"id": "yes", "title": "Yes"}]}},
        ]})
        self.keyword(a, flow)
        self.inbound(a)
        flow_runner.process_pending(self.db, 20)
        current = self.db.query(FlowSession).filter_by(flow_id=uuid.UUID(flow["id"])).one()
        before = self.db.query(Message).filter_by(tenant_id=self.tenant_a.id, direction="outbound").count()
        self.db.get(Flow, uuid.UUID(flow["id"])).channel_connection_id = uuid.UUID(b["id"])
        self.db.commit()
        flow_engine.resume_with_reply(self.db, current, "unrecognized")
        self.assertEqual(current.status, "failed")
        self.assertEqual(self.db.query(Message).filter_by(tenant_id=self.tenant_a.id, direction="outbound").count(), before)
