"""
Deliver matched keyword triggers: walk the selected flow's Start node and
send its message (or the keyword's fallback reply text) through the connected
channel provider.

This runs *after* the inbound transaction has committed — a worker picks up
``keyword_triggers`` rows in status ``matched`` — so no provider HTTP call ever
happens inside a webhook transaction, and it works uniformly for every channel
(WhatsApp, Messenger, Instagram, Web Chat).

Idempotency: the outbound ``idempotency_key`` is derived deterministically from
the trigger id, so a retried delivery never sends a second provider message;
the status transition (matched → delivered/failed/skipped) stops re-processing.
"""
import logging
import uuid
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contact, Conversation, Flow, Keyword, KeywordTrigger, Message, TenantMembership, User
from app.models.keyword_trigger import KeywordTriggerAction, KeywordTriggerStatus
from app.schemas.message import TextMessageCreate
from app.services import flow_engine, outbound_message_service
from app.services.outbound_message_service import OutboundMessageError
from app.services.channel_scope_service import flow_matches_channel

logger = logging.getLogger("app.services.flow_runner")

# Fixed namespace so a trigger always maps to the same idempotency key.
_IDEMPOTENCY_NS = uuid.UUID("6f3c1e02-7a21-4c9c-9b2e-5a1d0f7e4b10")


def _assistant_entry_supported(flow: Flow) -> bool:
    """A free-text entry must reach a conversational prompt without executing tools."""
    nodes = {str(n.get("id")): n for n in flow.nodes or []}
    current = flow_engine._start_node(flow.nodes or [])
    seen = set()
    while current and len(seen) < 30:
        key = str(current["id"])
        if key in seen:
            return False
        seen.add(key)
        kind = str((current.get("data") or {}).get("messageType") or "text")
        if kind in ("button", "list", "get_user_data"):
            return True
        if kind != "text":
            return False
        edges = [e for e in flow.edges or [] if str(e.get("source")) == key and e.get("sourceHandle") in (None, "", "continue")]
        current = nodes.get(str(edges[0].get("target"))) if len(edges) == 1 else None
    return False


def _actor(db: Session, tenant_id: uuid.UUID, keyword: Keyword | None) -> User | None:
    """The user the auto-reply is sent as: the keyword's author, else any
    active member of the tenant."""
    if keyword is not None and keyword.created_by_user_id:
        user = db.get(User, keyword.created_by_user_id)
        if user is not None:
            return user
    return db.execute(
        select(User)
        .join(TenantMembership, TenantMembership.user_id == User.id)
        .where(TenantMembership.tenant_id == tenant_id, TenantMembership.status == "active", User.is_active.is_(True))
        .order_by(User.created_at.asc())
    ).scalars().first()


def _flow_has_content(flow: Flow) -> bool:
    """Whether the flow has anything to run (beyond an empty default node)."""
    for node in flow.nodes or []:
        data = node.get("data") or {}
        if str(data.get("messageType") or "text") != "text":
            return True
        if str(data.get("message") or "").strip():
            return True
    return False


def _flow_start_text(flow: Flow) -> str | None:
    """Text of the flow's Start node (or the first node) when it is a text message."""
    nodes = flow.nodes or []
    start = next((n for n in nodes if (n.get("data") or {}).get("isStart")), None)
    if start is None and nodes:
        start = nodes[0]
    if not start:
        return None
    data = start.get("data") or {}
    text = str(data.get("message") or "").strip()
    return text or None


def _resolve_text(db: Session, trigger: KeywordTrigger, keyword: Keyword | None) -> str | None:
    """Prefer the flow's entry message; fall back to the keyword's reply text."""
    if trigger.action == KeywordTriggerAction.RUN_FLOW.value and trigger.flow_id:
        flow = db.get(Flow, trigger.flow_id)
        if flow is not None and flow.tenant_id == trigger.tenant_id:
            text = _flow_start_text(flow)
            if text:
                return text
    if keyword is not None and keyword.reply_text:
        return keyword.reply_text.strip() or None
    return None


def _deliver_ai_reply(db: Session, trigger: KeywordTrigger) -> bool:
    """Generate an AI reply to the triggering message, charge credits, and send
    it. Runs in the worker (never the inbound transaction)."""
    from app.services import ai_reply_service, payment_service, channel_assistant_service as assistant

    conversation = db.get(Conversation, trigger.conversation_id)
    contact = db.get(Contact, trigger.contact_id)
    message = db.get(Message, trigger.message_id)
    if conversation is None or contact is None or message is None:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = "Missing conversation, contact or message for the AI reply."
        return False

    if (conversation.conversation_metadata or {}).get("mode") == "human":
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Conversation is now handled by a human."
        return False
    config = assistant.config_for(db, conversation)
    if config is None or config.fallback_action != "ai":
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "AI is not enabled for this channel."
        return False
    actor = _actor(db, trigger.tenant_id, None)
    if actor is None:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = "No active user to send the AI reply as."
        return False

    # A panel-selected entry flow lets a free-text first message enter the
    # same menus and fields as a keyword. Never select another channel's flow.
    if config.flow_ai_enabled and config.fallback_flow_id:
        flow = db.get(Flow, config.fallback_flow_id)
        if not flow_matches_channel(flow, trigger.tenant_id, conversation.channel_connection_id):
            trigger.status = KeywordTriggerStatus.SKIPPED.value
            trigger.detail = "Default assistant flow is not assigned to this channel."
            return False
        if _assistant_entry_supported(flow):
            session = flow_engine.start_session(db, flow, conversation, contact, actor.id)
            if session is None:
                trigger.status = KeywordTriggerStatus.SKIPPED.value
                trigger.detail = "A flow is already handling this conversation."
                return False
            if session.status == "waiting" and session.wait_kind == "reply":
                flow_engine.resume_with_reply(db, session, json.dumps({"text": message.text or "", "message_id": str(message.id)}))
            trigger.status = KeywordTriggerStatus.FAILED.value if session.status == "failed" else KeywordTriggerStatus.DELIVERED.value
            trigger.detail = "Channel assistant entry flow started."
            return session.status != "failed"

    # Credit gate: never call the AI provider when the balance is exhausted.
    text = assistant.unavailable_reply(config, conversation)
    charge = 0
    handover = False
    generated = False
    if config.flow_ai_enabled:
        decision = assistant.interpret(db, conversation, message.text or "", config, message=message)
        db.refresh(conversation, attribute_names=["conversation_metadata"])
        if (conversation.conversation_metadata or {}).get("mode") == "human":
            trigger.status = KeywordTriggerStatus.SKIPPED.value
            trigger.detail = "Human takeover while generating the reply."
            return False
        if decision and decision.action in ("answer", "clarify", "handover") and decision.reply.strip():
            text = decision.reply
            handover = decision.action == "handover"
            generated = True
            assistant.remember_language(conversation, decision.language)
    elif payment_service.get_or_create_balance(db, trigger.tenant_id) > 0:
        result = ai_reply_service.generate_reply(
            db, trigger.tenant_id, message.text or "",
            system_prompt=assistant.fallback_prompt(assistant.context_for(db, conversation, config)),
            history=assistant.history_for(db, conversation, before_message=message),
        )
        if result:
            text = result["text"]
            generated = True
            charge = payment_service.credits_for_tokens(result["tokens_in"] + result["tokens_out"])
            payment_service.deduct_credits(db, trigger.tenant_id, charge, conversation_id=conversation.id,
                                          description="AI reply", model=result.get("model"),
                                          tokens_in=result["tokens_in"], tokens_out=result["tokens_out"])

    if (conversation.conversation_metadata or {}).get("mode") == "human":
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Human takeover while generating the reply."
        return False
    key = uuid.uuid5(_IDEMPOTENCY_NS, f"ai-reply:{trigger.id}")
    try:
        outbound_message_service.send_message(
            db, trigger.tenant_id, actor, conversation.id,
            TextMessageCreate(type="text", text=text[:4096]), idempotency_key=key,
        )
    except OutboundMessageError as exc:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = f"{type(exc).__name__}: {exc}"[:500]
        return False

    trigger.status = KeywordTriggerStatus.DELIVERED.value
    if handover:
        conversation.conversation_metadata = {**(conversation.conversation_metadata or {}), "mode": "human"}
    trigger.detail = ("Channel assistant reply sent." if config.flow_ai_enabled else f"AI reply sent ({charge} credits)") if generated else "AI unavailable notice sent."
    return True


def deliver_trigger(db: Session, trigger: KeywordTrigger) -> bool:
    """
    Send the reply for one matched trigger and record the outcome on the row.
    Returns True when a provider message was sent. Expected send failures mark
    the trigger ``failed`` (never raise).
    """
    # A global-fallback trigger has no keyword.
    keyword = db.get(Keyword, trigger.keyword_id) if trigger.keyword_id else None
    conversation = db.get(Conversation, trigger.conversation_id)
    if conversation is None or conversation.tenant_id != trigger.tenant_id:
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Conversation unavailable for this workspace."
        return False
    if keyword is not None and (keyword.tenant_id != trigger.tenant_id or keyword.channel_connection_id != conversation.channel_connection_id):
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Keyword is not assigned to this conversation channel."
        return False
    if trigger.flow_id and not flow_matches_channel(db.get(Flow, trigger.flow_id), trigger.tenant_id, conversation.channel_connection_id):
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Flow is not assigned to this conversation channel."
        return False

    # Global AI fallback: generate an AI reply and charge credits.
    if trigger.action == KeywordTriggerAction.AI_REPLY.value:
        from app.models import TenantRoutingConfig
        if not db.query(TenantRoutingConfig).filter_by(
            tenant_id=trigger.tenant_id, channel_connection_id=conversation.channel_connection_id,
            fallback_action="ai",
        ).first():
            trigger.status = KeywordTriggerStatus.SKIPPED.value
            trigger.detail = "AI fallback is not enabled for this conversation channel."
            return False
        return _deliver_ai_reply(db, trigger)

    # A selected flow with runnable content runs through the stateful engine.
    if trigger.action == KeywordTriggerAction.RUN_FLOW.value and trigger.flow_id:
        flow = db.get(Flow, trigger.flow_id)
        if flow is not None and flow.tenant_id == trigger.tenant_id and _flow_has_content(flow):
            conversation = db.get(Conversation, trigger.conversation_id)
            contact = db.get(Contact, trigger.contact_id)
            if conversation is None or contact is None:
                trigger.status = KeywordTriggerStatus.FAILED.value
                trigger.detail = "Missing conversation or contact for the flow."
                return False
            actor = _actor(db, trigger.tenant_id, keyword)
            session = flow_engine.start_session(db, flow, conversation, contact, actor.id if actor else None)
            if session is None:
                trigger.status = KeywordTriggerStatus.SKIPPED.value
                trigger.detail = "A flow is already running for this conversation."
                return False
            if session.status == "failed":
                trigger.status = KeywordTriggerStatus.FAILED.value
                trigger.detail = f"Flow failed: {session.detail}"[:500]
                return False
            trigger.status = KeywordTriggerStatus.DELIVERED.value
            trigger.detail = f"Flow session {session.id} ({session.status})"
            return True
        # Flow has no graph → fall back to the text path below.

    text = _resolve_text(db, trigger, keyword)
    if not text:
        trigger.status = KeywordTriggerStatus.SKIPPED.value
        trigger.detail = "Nothing to send (flow has no entry text and no reply text)."
        return False
    if trigger.conversation_id is None:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = "No conversation to reply in."
        return False
    actor = _actor(db, trigger.tenant_id, keyword)
    if actor is None:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = "No active user to send as."
        return False

    key = uuid.uuid5(_IDEMPOTENCY_NS, f"keyword-trigger:{trigger.id}")
    try:
        outbound_message_service.send_message(
            db, trigger.tenant_id, actor, trigger.conversation_id,
            TextMessageCreate(type="text", text=text[:4096]), idempotency_key=key,
        )
    except OutboundMessageError as exc:
        trigger.status = KeywordTriggerStatus.FAILED.value
        trigger.detail = f"{type(exc).__name__}: {exc}"[:500]
        return False

    trigger.status = KeywordTriggerStatus.DELIVERED.value
    trigger.detail = f"Delivered: {text[:200]}"
    return True


def process_pending(db: Session, limit: int = 50) -> dict[str, int]:
    """Deliver a batch of matched triggers. Each is committed on its own."""
    rows = db.execute(
        select(KeywordTrigger)
        .where(
            KeywordTrigger.status == KeywordTriggerStatus.MATCHED.value,
            KeywordTrigger.action.in_([
                KeywordTriggerAction.RUN_FLOW.value,
                KeywordTriggerAction.SEND_TEXT.value,
                KeywordTriggerAction.AI_REPLY.value,
            ]),
        )
        .order_by(KeywordTrigger.created_at.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).scalars().all()

    delivered = failed = skipped = 0
    for trigger in rows:
        tid = trigger.id
        try:
            ok = deliver_trigger(db, trigger)
            final = trigger.status
            db.commit()
            if ok:
                delivered += 1
            elif final == KeywordTriggerStatus.SKIPPED.value:
                skipped += 1
            else:
                failed += 1
        except Exception as exc:  # Unexpected fault: mark failed, keep the worker alive.
            db.rollback()
            failed += 1
            logger.exception("keyword_delivery_failed", extra={"trigger_id": str(tid), "error_type": type(exc).__name__})
            fresh = db.get(KeywordTrigger, tid)
            if fresh is not None and fresh.status == KeywordTriggerStatus.MATCHED.value:
                fresh.status = KeywordTriggerStatus.FAILED.value
                fresh.detail = f"Delivery error: {type(exc).__name__}"
                db.commit()
    return {"processed": len(rows), "delivered": delivered, "failed": failed, "skipped": skipped}
