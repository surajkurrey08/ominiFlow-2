"""Browser-mediated plugin pairing: no server requests to customer URLs.

The website admin explicitly approves the settings using its own authenticated
API. A 256-bit, single-use handoff travels only in strict-origin postMessage
and a POST body, never a URL or browser storage. Tenant ownership is resolved
from the locked pairing row, not from the public completion payload.
"""
import hashlib
import hmac
import ipaddress
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChannelConnection, ChannelStatus, ChannelType, Message, MessageDirection, WebChatPairing
from app.schemas.web_chat_pairing import WebChatInstallationResponse, WebChatPairingResponse, WebChatSetupRequest, WebChatWidgetSettings
from app.services.channel_service import _to_response


class PairingError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def utcnow():
    return datetime.now(timezone.utc)


def normalize_origin(value: str, *, production: bool | None = None) -> str:
    """Exact browser origins only; no credentials, paths, query or fragments."""
    production = settings.is_production if production is None else production
    try:
        parsed = urlsplit(value.strip())
        host = parsed.hostname
        if not host or parsed.scheme not in {"http", "https"} or parsed.username is not None or parsed.password is not None:
            raise ValueError()
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment or parsed.netloc.endswith(":"):
            raise ValueError()
        host = host.encode("idna").decode("ascii").lower()
        if host.endswith(".") or any(c in host for c in "\\%\r\n\t "):
            raise ValueError()
        local = host == "localhost" or host.endswith((".localhost", ".local"))
        try:
            local = local or not ipaddress.ip_address(host).is_global
        except ValueError:
            local = local or "." not in host
        if production and (parsed.scheme != "https" or local):
            raise PairingError("Live website connections require public HTTPS addresses. Ask your Omniflow administrator to configure the public service URLs.")
        if parsed.scheme == "http" and not local:
            raise ValueError()
        port = parsed.port
        if ":" in host:
            host = f"[{host}]"
        suffix = f":{port}" if port and port != (443 if parsed.scheme == "https" else 80) else ""
        return f"{parsed.scheme}://{host}{suffix}"
    except (ValueError, UnicodeError):
        raise PairingError("Enter a website base URL such as https://your-website.com, without a path, credentials or query.") from None


def _channel(db, tenant_id, channel_id):
    channel = db.query(ChannelConnection).filter_by(id=channel_id, tenant_id=tenant_id, is_deleted=False).with_for_update().first()
    if channel is None:
        raise PairingError("Channel not found.", 404)
    if channel.channel_type != ChannelType.WEB_CHAT:
        raise PairingError("Choose a Web Chat channel.")
    return channel


def _metadata(channel):
    return dict((channel.provider_metadata or {}).get("web_chat") or {})


def _save_metadata(channel, metadata):
    channel.provider_metadata = {**(channel.provider_metadata or {}), "web_chat": metadata}


def create_website_channel(db: Session, tenant_id, user_id, data: WebChatSetupRequest):
    origin = normalize_origin(data.website_url)
    channel = ChannelConnection(
        tenant_id=tenant_id, created_by=user_id, name=data.name,
        channel_type=ChannelType.WEB_CHAT, status=ChannelStatus.CONNECTED,
        external_account_id=f"wc_{secrets.token_urlsafe(24)}", is_active=True,
        last_connected_at=utcnow(), provider_metadata={"web_chat": {"website_origin": origin}},
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return _to_response(channel)


def widget_settings(db: Session, tenant_id, channel_id):
    """Read public plugin values without creating or consuming a pairing request."""
    channel = _channel(db, tenant_id, channel_id)
    frontend = normalize_origin(settings.web_chat_public_frontend_url or settings.frontend_url)
    backend = normalize_origin(settings.web_chat_public_backend_url)
    website = _metadata(channel).get("website_origin")
    if website and urlsplit(website).hostname not in {"localhost", "127.0.0.1", "::1"}:
        normalize_origin(frontend, production=True)
        normalize_origin(backend, production=True)
    if not channel.external_account_id:
        raise PairingError("Activate this Web Chat channel to generate its public widget key.", 409)
    return WebChatWidgetSettings(channel_id=channel.id, frontend_url=frontend,
                                 backend_url=backend, public_key=channel.external_account_id)


def start_pairing(db: Session, tenant_id, user_id, channel_id, opener_origin: str):
    channel = _channel(db, tenant_id, channel_id)
    if channel.status != ChannelStatus.CONNECTED or not channel.is_active:
        raise PairingError("Activate this Web Chat channel before connecting a website.", 409)
    meta = _metadata(channel)
    if not meta.get("website_origin"):
        raise PairingError("Save a website address before starting the connection.")
    website = normalize_origin(meta["website_origin"])
    widget = widget_settings(db, tenant_id, channel_id)
    frontend, backend = widget.frontend_url, widget.backend_url
    opener = normalize_origin(opener_origin)
    allowed = {normalize_origin(v) for v in settings.allowed_frontend_origins}
    allowed.add(frontend)
    if opener not in allowed:
        raise PairingError("Open this workspace from its configured Omniflow address.", 403)
    previous = db.query(WebChatPairing).filter_by(channel_id=channel.id, consumed_at=None, cancelled_at=None).all()
    for pending in previous:
        pending.cancelled_at = utcnow()
    token = secrets.token_urlsafe(32)
    pairing = WebChatPairing(
        tenant_id=tenant_id, channel_id=channel.id, user_id=user_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(), website_origin=website,
        expires_at=utcnow() + timedelta(minutes=10),
    )
    db.add(pairing)
    db.flush()
    _save_metadata(channel, {**meta, "active_pairing_id": str(pairing.id)})
    db.commit()
    return WebChatPairingResponse(
        pairing_id=pairing.id, channel_id=channel.id, channel_name=channel.name,
        website_origin=website, frontend_url=frontend, backend_url=backend,
        authorization_url=f"{website}/omniflow/connect?{urlencode({'origin': opener, 'request_id': str(pairing.id)})}",
        public_key=channel.external_account_id, token=token, expires_at=pairing.expires_at,
    )


def save_website(db: Session, tenant_id, channel_id, data: WebChatSetupRequest):
    origin = normalize_origin(data.website_url)
    channel = _channel(db, tenant_id, channel_id)
    meta = _metadata(channel)
    if meta.get("paired_at") and origin != meta.get("website_origin"):
        raise PairingError("Create a separate channel for a different website. This channel already has an authorized installation.", 409)
    if origin != meta.get("website_origin"):
        for pairing in db.query(WebChatPairing).filter_by(channel_id=channel.id, consumed_at=None, cancelled_at=None).all():
            pairing.cancelled_at = utcnow()
    channel.name = data.name
    _save_metadata(channel, {**meta, "website_origin": origin})
    db.commit()
    db.refresh(channel)
    return _to_response(channel)


def complete_pairing(db: Session, pairing_id, data):
    # Lock the channel before the pairing, as start/cancel do, avoiding lock inversion.
    lookup = db.get(WebChatPairing, pairing_id)
    if lookup is None:
        raise PairingError("Connection request is invalid or expired.", 404)
    channel = _channel(db, lookup.tenant_id, lookup.channel_id)
    pairing = db.query(WebChatPairing).filter_by(id=pairing_id).populate_existing().with_for_update().one()
    if not hmac.compare_digest(pairing.token_hash, hashlib.sha256(data.token.encode()).hexdigest()):
        raise PairingError("Connection request could not be verified.", 403)
    if data.website_origin != pairing.website_origin:
        raise PairingError("The website does not match this connection request.", 403)
    if pairing.expires_at <= utcnow() or pairing.cancelled_at is not None:
        raise PairingError("Connection request expired. Start again from Omniflow.", 409)
    meta = _metadata(channel)
    if channel.status != ChannelStatus.CONNECTED or not channel.is_active or meta.get("active_pairing_id") != str(pairing.id) or meta.get("website_origin") != pairing.website_origin:
        raise PairingError("This connection request is no longer active.", 409)
    if pairing.consumed_at is not None:
        # Lost response retry is safe, but a replay cannot modify the installation.
        if meta.get("plugin_revision") == data.plugin_revision:
            return {"status": "authorized"}
        raise PairingError("Connection request was already used.", 409)
    pairing.consumed_at = utcnow()
    _save_metadata(channel, {
        **meta, "paired_at": pairing.consumed_at.isoformat(),
        "plugin_revision": data.plugin_revision,
    })
    db.commit()
    return {"status": "authorized"}


def cancel_pairing(db: Session, tenant_id, channel_id, pairing_id):
    channel = _channel(db, tenant_id, channel_id)
    pairing = db.query(WebChatPairing).filter_by(id=pairing_id, channel_id=channel.id, tenant_id=tenant_id).with_for_update().first()
    if pairing is None:
        raise PairingError("Connection request not found.", 404)
    if pairing.consumed_at is None and pairing.cancelled_at is None:
        pairing.cancelled_at = utcnow()
    db.commit()
    return installation(db, tenant_id, channel_id)


def installation(db: Session, tenant_id, channel_id):
    channel = _channel(db, tenant_id, channel_id)
    meta = _metadata(channel)
    last_in = db.query(func.max(Message.created_at)).filter_by(channel_connection_id=channel.id, tenant_id=tenant_id, direction=MessageDirection.INBOUND).scalar()
    last_out = db.query(func.max(Message.created_at)).filter_by(channel_connection_id=channel.id, tenant_id=tenant_id, direction=MessageDirection.OUTBOUND).scalar()
    pairing = db.get(WebChatPairing, uuid.UUID(meta["active_pairing_id"])) if meta.get("active_pairing_id") else None
    paired_at = datetime.fromisoformat(meta["paired_at"]) if meta.get("paired_at") else None
    state = "authorized" if paired_at else "not_connected"
    if last_in and (paired_at is None or last_in >= paired_at):
        state = "active"
    if state != "active" and pairing and pairing.consumed_at is None and pairing.cancelled_at is None:
        state = "expired" if pairing.expires_at <= utcnow() else "awaiting_approval"
    if channel.status != ChannelStatus.CONNECTED or not channel.is_active:
        state = "disconnected"
    return WebChatInstallationResponse(
        channel_id=channel.id, website_url=meta.get("website_origin"), installation_status=state,
        paired_at=paired_at, last_visitor_message_at=last_in, last_agent_message_at=last_out,
        pairing_id=pairing.id if pairing else None, expires_at=pairing.expires_at if pairing else None,
    )
