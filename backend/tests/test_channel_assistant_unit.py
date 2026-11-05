"""Provider-free runtime boundary tests; no database or paid API calls."""
import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS
from unittest.mock import Mock, patch
from fastapi import HTTPException

from app.models import Contact, Conversation, Flow
from app.services import ai_reply_service as ai, channel_assistant_service as assistant, flow_engine as engine, flow_runner, keyword_trigger_service


def node(key, kind="text", **data):
    return {"id": key, "data": {"messageType": kind, **data}}


def edge(source, target, handle="continue"):
    return {"source": source, "target": target, "sourceHandle": handle}


def decision(action="advance", route=None, values=None, reply="", language="en"):
    return ai.FlowDecision(action=action, route=route or [], values=values or [], reply=reply, language=language)


class ChannelAssistantUnitTests(unittest.TestCase):
    def setUp(self):
        self.tenant, self.channel, self.conv_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.conversation = Conversation(id=self.conv_id, tenant_id=self.tenant, channel_connection_id=self.channel,
                                         conversation_metadata={"mode": "chatbot"})
        self.nodes = [node("menu", "button", message="Choose a service", buttons=[{"id": "villa", "title": "Villa enquiry"}]),
                      node("destination", "get_user_data", variable="destination", message="Where?"),
                      node("guests", "get_user_data", variable="guests", message="How many guests?"),
                      node("preferences", "get_user_data", variable="preferences", message="Preferences?"),
                      node("review", "button", message="Review {{guests}}", buttons=[{"id": "confirm", "title": "Submit"}]),
                      node("done", message="Enquiry recorded")]
        self.edges = [edge("menu", "destination", "btn:villa"), edge("destination", "guests"), edge("guests", "preferences"),
                      edge("preferences", "review"), edge("review", "done", "btn:confirm")]
        self.session = NS(id=uuid.uuid4(), tenant_id=self.tenant, conversation_id=self.conv_id,
                          flow_id=uuid.uuid4(), contact_id=uuid.uuid4(), actor_user_id=uuid.uuid4(),
                          nodes=self.nodes, edges=self.edges, variables={"_reply_event": str(uuid.uuid4())},
                          status="waiting", wait_kind="reply", waiting_node_id="destination", current_node_id="destination")
        self.config = NS(tenant_id=self.tenant, channel_connection_id=self.channel, flow_ai_enabled=True,
                         ai_knowledge="This channel only", ai_instructions="Keep replies brief", ai_unavailable_reply="")
        self.db = Mock()
        self.db.get.return_value = None

    def test_language_names_match_without_ai_or_business_specific_rules(self):
        menu = node("languages", "button", buttons=[{"id": "en", "title": "English"}, {"id": "hi", "title": "हिंदी"}, {"id": "mr", "title": "मराठी"}])
        for text, expected in [("Hindi", "hi"), ("hindi!", "hi"), ("हिन्दी", "hi"), ("Marathi", "mr"), ("मराठी", "mr"), ("2", "hi")]:
            self.assertEqual(engine._match_choice(menu, text), f"btn:{expected}")

    def test_panel_authored_aliases_and_ambiguous_choices(self):
        menu = node("m", "button", buttons=[{"id": "a", "title": "Villa", "aliases": ["stay"]}, {"id": "b", "title": "Villa support"}])
        self.assertEqual(engine._match_choice(menu, "stay"), "btn:a")
        self.assertIsNone(engine._match_choice(menu, "vil"))

    def test_extract_multiple_values_on_selected_branch(self):
        result = engine._assistant_plan(self.session, self.nodes[0], decision(route=[{"node_id": "menu", "option_id": "villa"}],
            values=[{"variable": "guests", "value": "6"}, {"variable": "preferences", "value": "private pool"}]))
        self.assertEqual(result, ("destination", {"guests": "6", "preferences": "private pool"}))

    def test_rejects_unknown_and_internal_variables(self):
        for variable in ("other_business_details", "_reply_event"):
            self.assertIsNone(engine._assistant_plan(self.session, self.nodes[1], decision(values=[{"variable": variable, "value": "bad"}])))

    def test_rejects_cross_branch_jump_and_unknown_option(self):
        for route in [[{"node_id": "review", "option_id": "confirm"}], [{"node_id": "menu", "option_id": "unknown"}]]:
            self.assertIsNone(engine._assistant_plan(self.session, self.nodes[0], decision(route=route)))

    def test_ai_cannot_submit_review(self):
        self.assertIsNone(engine._assistant_plan(self.session, self.nodes[4], decision(route=[{"node_id": "review", "option_id": "confirm"}])))

    def test_negation_is_not_an_exact_confirmation(self):
        self.assertIsNone(engine._match_choice(self.nodes[4], "do not submit"))
        self.assertIsNone(engine._match_choice(self.nodes[4], "sub"))
        self.assertEqual(engine._match_choice(self.nodes[4], "Submit"), "btn:confirm")

    def test_ai_cannot_route_to_payment_or_api_actions(self):
        for kind in ("external_api", "razorpay", "actions"):
            self.session.nodes = [self.nodes[0], node("tool", kind, apiHeaders={"secret": "never-send"})]
            self.session.edges = [edge("menu", "tool", "btn:villa")]
            self.assertIsNone(engine._assistant_plan(self.session, self.nodes[0], decision(route=[{"node_id": "menu", "option_id": "villa"}])))
            self.assertNotIn("never-send", json.dumps(assistant.graph_context(self.session, self.nodes[0])))

    def test_free_text_entry_cannot_execute_tools_before_first_prompt(self):
        for kind in ("external_api", "razorpay", "actions", "delay"):
            flow = NS(nodes=[node("intro", message="Hello"), node("tool", kind)], edges=[edge("intro", "tool")])
            self.assertFalse(flow_runner._assistant_entry_supported(flow))
        self.assertTrue(flow_runner._assistant_entry_supported(NS(nodes=self.nodes, edges=self.edges)))

    def test_previous_answers_are_not_silently_overwritten(self):
        self.session.variables["guests"] = "4"
        self.assertIsNone(engine._assistant_plan(self.session, self.nodes[1], decision(values=[{"variable": "guests", "value": "6"}])))

    def test_question_does_not_become_a_data_answer(self):
        result = decision("answer", reply="The team must confirm the price. Which destination?")
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=result), patch.object(engine, "_send_text") as send:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Price kya hai?")
            self.assertNotIn("destination", self.session.variables)
            self.assertEqual(self.session.waiting_node_id, "destination")
            send.assert_called_once()

    def test_extracted_future_fields_keep_missing_question(self):
        result = decision(values=[{"variable": "guests", "value": "6"}])
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=result), patch.object(engine, "_send_text") as send:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "6 guests")
            self.assertEqual(self.session.variables["guests"], "6")
            self.assertEqual(self.session.status, "waiting")
            self.assertEqual(send.call_args.args[3], "Where?")

    def test_valid_capture_advances_with_only_allowed_values(self):
        result = decision(values=[{"variable": "destination", "value": "Pune"}, {"variable": "guests", "value": "6"}])
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=result), patch.object(engine, "_run") as run:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Pune for six people")
            self.assertEqual(self.session.variables["destination"], "Pune")
            self.assertEqual(set(self.session.variables["_assistant_filled"]), {"destination", "guests"})
            run.assert_called_once()

    def test_provider_outage_keeps_step_and_replies_every_turn(self):
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=None), patch.object(engine, "_send_text") as send:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Anything")
            self.session.variables["_reply_event"] = str(uuid.uuid4())
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Anything again")
            self.assertEqual(send.call_count, 2)
            self.assertNotEqual(send.call_args_list[0].kwargs["seq"], send.call_args_list[1].kwargs["seq"])
            self.assertEqual(self.session.waiting_node_id, "destination")

    def test_handover_pauses_bot_without_claiming_agent_assignment(self):
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=decision("handover", reply="Switching this chat to our team.")), patch.object(engine, "_send_text"):
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Talk to a person")
            self.assertEqual(self.conversation.conversation_metadata["mode"], "human")
            self.assertEqual(self.session.status, "completed")

    def test_disabled_channel_does_not_call_provider(self):
        self.config.flow_ai_enabled = False
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret") as call:
            self.assertFalse(engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Hello"))
            call.assert_not_called()

    def test_wrong_channel_or_tenant_cannot_use_knowledge(self):
        with patch.object(ai, "generate_flow_decision") as call:
            for field in ("tenant_id", "channel_connection_id"):
                original = getattr(self.config, field)
                setattr(self.config, field, uuid.uuid4())
                self.assertIsNone(assistant.interpret(self.db, self.conversation, "Hello", self.config))
                setattr(self.config, field, original)
            call.assert_not_called()

    def test_zero_credits_never_calls_ai(self):
        with patch.object(assistant.payment_service, "get_or_create_balance", return_value=0), patch.object(ai, "generate_flow_decision") as call:
            self.assertIsNone(assistant.interpret(self.db, self.conversation, "Hello", self.config))
            call.assert_not_called()

    def test_human_request_works_when_provider_is_unavailable(self):
        with patch.object(ai, "generate_flow_decision") as call:
            result = assistant.interpret(self.db, self.conversation, "Talk to a person", self.config)
            self.assertEqual(result.action, "handover")
            call.assert_not_called()

    def test_reply_arriving_while_prompt_is_published_is_not_dropped(self):
        self.session.status = "active"
        message = NS(id=uuid.uuid4(), text="Pune", direction="inbound", message_metadata={})
        with patch.object(engine, "active_session_for", return_value=self.session), patch.object(keyword_trigger_service, "flow_matches_channel", return_value=True), patch.object(engine, "capture_reply") as capture:
            keyword_trigger_service.handle_inbound(self.db, tenant_id=self.tenant, channel_type="web_chat",
                channel_connection_id=self.channel, conversation=self.conversation, contact=NS(), message=message)
            capture.assert_called_once()
            self.assertEqual(capture.call_args.kwargs["message_id"], message.id)

    def test_real_walk_skips_extracted_fields_and_stops_before_confirmation(self):
        self.session.current_node_id = "destination"
        self.session.variables = {"destination": "Pune", "guests": "6", "preferences": "pool",
                                  "_assistant_filled": ["destination", "guests", "preferences"]}
        def get(model, key):
            if model is Conversation: return self.conversation
            if model is Flow: return NS(tenant_id=self.tenant, channel_connection_id=self.channel)
            return None
        self.db.get.side_effect = get
        with patch.object(engine, "_send_text") as send, patch.object(engine, "_send_interactive") as menu:
            engine._run(self.db, self.session)
            self.assertEqual(self.session.waiting_node_id, "review")
            self.assertEqual(self.session.status, "waiting")
            send.assert_not_called()
            menu.assert_called_once()
            self.assertEqual(self.session.variables["_assistant_filled"], [])

    def test_completed_field_does_not_hide_a_missing_question(self):
        self.session.current_node_id = "destination"
        self.session.variables = {"destination": "Pune", "_assistant_filled": ["destination"]}
        def get(model, key):
            if model is Conversation: return self.conversation
            if model is Flow: return NS(tenant_id=self.tenant, channel_connection_id=self.channel)
            return None
        self.db.get.side_effect = get
        with patch.object(engine, "_send_text") as send:
            engine._run(self.db, self.session)
            self.assertEqual(self.session.waiting_node_id, "guests")
            self.assertEqual(send.call_args.args[3], "How many guests?")

    def test_human_mode_stops_flow_before_provider_calls(self):
        self.conversation.conversation_metadata = {"mode": "human"}
        def get(model, key):
            if model is Conversation: return self.conversation
            if model is Flow: return NS(tenant_id=self.tenant, channel_connection_id=self.channel)
            return None
        self.db.get.side_effect = get
        with patch.object(engine, "_assist_reply") as assist:
            engine.resume_with_reply(self.db, self.session, "Hello")
            assist.assert_not_called()

    def test_human_takeover_during_provider_call_prevents_late_bot_reply(self):
        def refresh(*args, **kwargs):
            self.conversation.conversation_metadata = {"mode": "human"}
        self.db.refresh.side_effect = refresh
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=decision("answer", reply="Late answer")), patch.object(engine, "_send_text") as send:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Hello")
            send.assert_not_called()

    def test_human_takeover_during_provider_call_prevents_late_bot_reply(self):
        def refresh(*args, **kwargs):
            self.conversation.conversation_metadata = {"mode": "human"}
        self.db.refresh.side_effect = refresh
        with patch.object(assistant, "config_for", return_value=self.config), patch.object(assistant, "interpret", return_value=decision("answer", reply="Late answer")), patch.object(engine, "_send_text") as send:
            engine._assist_reply(self.db, self.session, self.conversation, self.nodes[1], "Hello")
            send.assert_not_called()

    def test_context_never_uses_global_business_profile(self):
        self.db.get.return_value = NS(name="This channel", tenant_id=self.tenant)
        self.session.variables["_secret_internal"] = "not context"
        context = assistant.context_for(self.db, self.conversation, self.config, session=self.session, node=self.nodes[1])
        self.assertEqual(context["channel_knowledge"], "This channel only")
        self.assertNotIn("_secret_internal", context["collected_values"])

    def test_history_query_is_scoped_to_conversation_and_tenant(self):
        self.db.scalars.return_value = []
        assistant.history_for(self.db, self.conversation)
        query = self.db.scalars.call_args.args[0]
        params = query.compile().params
        self.assertIn(self.tenant, params.values())
        self.assertIn(self.conv_id, params.values())

    def test_pending_reply_keeps_valid_json_for_long_unicode_and_backslashes(self):
        engine.capture_reply(self.db, self.session, "\\\"मराठी" * 900, message_id=uuid.uuid4())
        self.assertLessEqual(len(self.session.pending_reply), 4096)
        self.assertIn("message_id", json.loads(self.session.pending_reply))


class StructuredProviderTests(unittest.TestCase):
    def test_validated_structured_output_and_bounded_provider_timeout(self):
        result = decision("answer", reply="Please share your dates.", language="hi")
        response = NS(choices=[NS(message=NS(content=result.model_dump_json(), refusal=None))], usage=NS(prompt_tokens=10, completion_tokens=5))
        with patch.object(ai, "_resolve_key_and_model", return_value=("test-key", "test-model")), patch("openai.OpenAI") as client:
            client.return_value.chat.completions.create.return_value = response
            got = ai.generate_flow_decision(Mock(), uuid.uuid4(), "Hindi mein bolo", context={}, history=[])
            self.assertEqual(got["decision"].language, "hi")
            self.assertEqual(client.call_args.kwargs["max_retries"], 0)
            self.assertEqual(client.return_value.chat.completions.create.call_args.kwargs["response_format"]["type"], "json_schema")

    def test_malformed_output_and_refusal_are_safe_no_ops(self):
        for message in [NS(content='{"action":"execute_arbitrary_code"}', refusal=None), NS(content=None, refusal="No")]:
            with patch.object(ai, "_resolve_key_and_model", return_value=("test-key", "test-model")), patch("openai.OpenAI") as client:
                client.return_value.chat.completions.create.return_value = NS(choices=[NS(message=message)])
                self.assertIsNone(ai.generate_flow_decision(Mock(), uuid.uuid4(), "hello", context={}, history=[]))


class ChannelSettingsTests(unittest.TestCase):
    def setUp(self):
        from app.models import TenantRoutingConfig
        self.tenant = NS(id=uuid.uuid4())
        self.channel = uuid.uuid4()
        self.config = TenantRoutingConfig(tenant_id=self.tenant.id, channel_connection_id=self.channel,
            ai_knowledge="Verified information", ai_instructions="Keep concise", flow_ai_enabled=True,
            updated_at=datetime.now(timezone.utc))
        self.db = Mock()
        query = self.db.query.return_value
        query.filter.return_value = query
        query.with_for_update.return_value = query
        query.first.return_value = self.config

    def test_routing_only_client_preserves_assistant_knowledge(self):
        from app.api.routing_config import update_routing_config
        from app.schemas.routing import RoutingConfigUpdate
        with patch("app.api.routing_config.owned_channel"):
            update_routing_config(RoutingConfigUpdate(channel_connection_id=self.channel, fallback_action="none"), self.tenant, self.db)
        self.assertEqual(self.config.ai_knowledge, "Verified information")
        self.assertTrue(self.config.flow_ai_enabled)
        self.db.query.return_value.with_for_update.assert_called_once()

    def test_stale_settings_do_not_overwrite_current_values(self):
        from app.api.routing_config import update_routing_config
        from app.schemas.routing import RoutingConfigUpdate
        body = RoutingConfigUpdate(channel_connection_id=self.channel, fallback_action="ai", ai_knowledge="Stale edit",
                                   expected_updated_at=self.config.updated_at - timedelta(seconds=1))
        with patch("app.api.routing_config.owned_channel"), self.assertRaises(HTTPException) as raised:
            update_routing_config(body, self.tenant, self.db)
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.config.ai_knowledge, "Verified information")
        self.db.commit.assert_not_called()

    def test_global_assistant_configuration_is_rejected(self):
        from app.api.routing_config import update_routing_config
        from app.schemas.routing import RoutingConfigUpdate
        with self.assertRaises(HTTPException) as raised:
            update_routing_config(RoutingConfigUpdate(fallback_action="ai", flow_ai_enabled=True), self.tenant, self.db)
        self.assertEqual(raised.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
