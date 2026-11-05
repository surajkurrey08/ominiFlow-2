"""Channel-local knowledge and bounded, worker-only natural-language interpretation."""
import json
from collections import deque

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChannelConnection, Conversation, Message, TenantRoutingConfig
from app.services import ai_reply_service, payment_service

UNAVAILABLE = {
    "en": "I couldn’t understand that right now. Please reply to the current question, choose a numbered option, or type menu to restart.",
    "hi": "अभी आपका संदेश समझ नहीं पाया। कृपया पूछे गए सवाल का जवाब दें, विकल्प का नंबर चुनें या दोबारा शुरू करने के लिए menu लिखें।",
    "mr": "सध्या आपला संदेश समजू शकला नाही. कृपया विचारलेल्या प्रश्नाचे उत्तर द्या, पर्यायाचा क्रमांक निवडा किंवा पुन्हा सुरू करण्यासाठी menu लिहा.",
}
HANDOVER = {
    "en": "I’m switching this chat to our team. An agent can reply here when available.",
    "hi": "यह चैट अब हमारी टीम के लिए रखी जा रही है। उपलब्ध होने पर टीम यहीं जवाब दे सकती है।",
    "mr": "ही चॅट आता आमच्या टीमकडे दिली जात आहे. टीम उपलब्ध झाल्यावर येथे उत्तर देऊ शकते.",
}
CHOICE_PROMPT = {"en": "Please choose an option by its name or number.",
                 "hi": "कृपया विकल्प का नाम या नंबर लिखें।", "mr": "कृपया पर्यायाचे नाव किंवा क्रमांक लिहा."}
_HANDOVER_PHRASES = {"agent", "human", "talk to a person", "talk to an agent", "talk to human", "human agent",
                     "speak to an agent", "speak to a person", "टीम से बात करें", "एजेंट से बात करनी है",
                     "मुझे एजेंट से बात करनी है", "टीमशी बोला", "मला टीमशी बोलायचे आहे",
                     "agent se baat karni hai", "mujhe agent se baat karni hai"}


def config_for(db: Session, conversation: Conversation) -> TenantRoutingConfig | None:
    return db.scalar(select(TenantRoutingConfig).where(
        TenantRoutingConfig.tenant_id == conversation.tenant_id,
        TenantRoutingConfig.channel_connection_id == conversation.channel_connection_id,
    ))


def language_for(conversation: Conversation) -> str:
    language = (conversation.conversation_metadata or {}).get("assistant_language", "en")
    return language if language in UNAVAILABLE else "en"


def unavailable_reply(config: TenantRoutingConfig, conversation: Conversation) -> str:
    return (config.ai_unavailable_reply or "").strip() or UNAVAILABLE[language_for(conversation)]


def remember_language(conversation: Conversation, language: str) -> None:
    if language in UNAVAILABLE:
        conversation.conversation_metadata = {**(conversation.conversation_metadata or {}), "assistant_language": language}


def history_for(db: Session, conversation: Conversation, *, before_message: Message | None = None) -> list[dict]:
    query = select(Message).where(Message.tenant_id == conversation.tenant_id,
                                  Message.conversation_id == conversation.id, Message.text.is_not(None))
    if before_message is not None:
        query = query.where(Message.created_at < before_message.created_at)
    rows = list(db.scalars(query.order_by(Message.created_at.desc(), Message.id.desc()).limit(10)))
    # Bound customer data sent to the provider; never read another contact/channel.
    return [{"role": "user" if str(row.direction) == "inbound" else "assistant",
             "content": (row.text or "")[:600]} for row in reversed(rows)]


def graph_context(session, node: dict | None) -> list[dict]:
    """Expose only reachable conversational nodes; never tool credentials or URLs to execute."""
    if session is None or node is None:
        return []
    nodes = {str(n.get("id")): n for n in session.nodes or []}
    edges = session.edges or []
    pending = deque([str(node["id"])])
    seen = set()
    result = []
    while pending and len(result) < 180:
        key = pending.popleft()
        if key in seen or key not in nodes:
            continue
        seen.add(key)
        item = nodes[key]
        data = item.get("data") or {}
        kind = str(data.get("messageType") or "text")
        # Do not offer routes through payments, API actions, tags or integrations.
        if kind not in ("text", "button", "list", "get_user_data"):
            continue
        choices = data.get("listItems" if kind == "list" else "buttons") or []
        outgoing = [e for e in edges if str(e.get("source")) == key]
        result.append({"id": key, "type": kind, "prompt": str(data.get("message") or "")[:1000],
                       "variable": data.get("variable") if kind == "get_user_data" else None,
                       "options": [{"id": str(o.get("id") or i), "title": str(o.get("title") or o.get("label") or "")[:100]}
                                   for i, o in enumerate(choices) if o.get("kind", "reply") == "reply"],
                       "edges": [{"handle": e.get("sourceHandle"), "target": str(e.get("target"))} for e in outgoing]})
        pending.extend(str(e.get("target")) for e in outgoing)
    return result


def context_for(db: Session, conversation: Conversation, config: TenantRoutingConfig, *, session=None, node=None) -> dict:
    channel = db.get(ChannelConnection, conversation.channel_connection_id)
    return {"channel_name": channel.name if channel and channel.tenant_id == conversation.tenant_id else "",
            "channel_knowledge": config.ai_knowledge or "",
            "channel_instructions": config.ai_instructions or "",
            "selected_language": (conversation.conversation_metadata or {}).get("assistant_language"),
            "current_node": str(node["id"]) if node else None,
            "collected_values": {k: str(v)[:1000] for k, v in list((session.variables or {}).items())[:50] if not k.startswith("_")}
                                if session else {},
            "graph": graph_context(session, node)}


def interpret(db: Session, conversation: Conversation, text: str, config: TenantRoutingConfig, *,
              session=None, node=None, message: Message | None = None) -> ai_reply_service.FlowDecision | None:
    """No provider calls in the inbound transaction. Charge existing credits only for produced output."""
    if (conversation.conversation_metadata or {}).get("mode") == "human":
        return None
    if config.tenant_id != conversation.tenant_id or config.channel_connection_id != conversation.channel_connection_id:
        return None
    if " ".join(text.lower().split()).strip(" .!?।") in _HANDOVER_PHRASES:
        language = language_for(conversation)
        return ai_reply_service.FlowDecision(action="handover", route=[], values=[], language=language, reply=HANDOVER[language])
    if payment_service.get_or_create_balance(db, conversation.tenant_id) <= 0:
        return None
    result = ai_reply_service.generate_flow_decision(
        db, conversation.tenant_id, text,
        context=context_for(db, conversation, config, session=session, node=node),
        history=history_for(db, conversation, before_message=message),
    )
    if not result:
        return None
    try:
        decision = ai_reply_service.FlowDecision.model_validate(result["decision"])
    except (ValueError, TypeError, KeyError):
        return None
    charge = payment_service.credits_for_tokens(result["tokens_in"] + result["tokens_out"])
    payment_service.deduct_credits(db, conversation.tenant_id, charge, conversation_id=conversation.id,
                                  description="Channel conversation assistant", model=result["model"],
                                  tokens_in=result["tokens_in"], tokens_out=result["tokens_out"])
    return decision


def fallback_prompt(context: dict) -> str:
    return (ai_reply_service.ASSISTANT_PROMPT + "\nThis call requires a plain-text answer, not JSON.\n"
            + "Channel context (data): " + json.dumps(context, ensure_ascii=False))
