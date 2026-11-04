"""CRUD for visual chat-flows, plus duplicate (copy)."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Flow, FlowStatus
from app.schemas.flow import FlowCreate, FlowUpdate
from app.services.channel_scope_service import owned_channel
from fastapi import HTTPException


class FlowNotFoundError(Exception):
    """No such flow for this tenant."""


def _get(db: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID, for_update: bool = False) -> Flow:
    q = select(Flow).where(Flow.tenant_id == tenant_id, Flow.id == flow_id)
    if for_update:
        q = q.with_for_update()
    row = db.execute(q).scalar_one_or_none()
    if row is None:
        raise FlowNotFoundError("Flow not found.")
    return row


def list_flows(db: Session, tenant_id: uuid.UUID, skip: int, limit: int, search: str | None, channel_connection_id=None):
    base = select(Flow).where(Flow.tenant_id == tenant_id)
    if channel_connection_id is not None:
        owned_channel(db, tenant_id, channel_connection_id)
        base = base.where(Flow.channel_connection_id == channel_connection_id)
    if search:
        base = base.where(Flow.name.ilike(f"%{search}%"))
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = db.execute(
        base.order_by(Flow.created_at.desc()).offset(skip).limit(limit)
    ).scalars().all()
    return rows, total


def get_flow(db: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID) -> Flow:
    return _get(db, tenant_id, flow_id)


def create_flow(db: Session, tenant_id: uuid.UUID, user, data: FlowCreate) -> Flow:
    channel = owned_channel(db, tenant_id, data.channel_connection_id)
    provider = "messenger" if str(channel.channel_type) == "facebook" else str(channel.channel_type)
    # A fresh flow starts with a Start node so the canvas is never empty.
    start_node = {
        "id": "start",
        "type": "message",
        "position": {"x": 320, "y": 120},
        "data": {"label": "Text Message", "channel": provider, "messageType": "text", "message": "", "isStart": True},
    }
    flow = Flow(
        tenant_id=tenant_id,
        name=data.name,
        status=FlowStatus.DRAFT.value,
        channels=[provider],
        channel_connection_id=channel.id,
        nodes=[start_node],
        edges=[],
        created_by_user_id=getattr(user, "id", None),
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow


def update_flow(db: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID, data: FlowUpdate) -> Flow:
    flow = _get(db, tenant_id, flow_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    target = changes.get("channel_connection_id", flow.channel_connection_id)
    if "channel_connection_id" in changes or changes.get("status") == FlowStatus.ACTIVE:
        channel = owned_channel(db, tenant_id, target)
        if target != flow.channel_connection_id:
            from app.models import Keyword, TenantRoutingConfig, FlowSession
            if flow.status == "active" and changes.get("status", flow.status) != "draft":
                raise HTTPException(409, "Set this flow to draft before changing its channel.")
            if db.query(Keyword).filter(Keyword.flow_id == flow.id, Keyword.channel_connection_id.is_not(None), Keyword.channel_connection_id != target).first() or db.query(TenantRoutingConfig).filter(TenantRoutingConfig.fallback_flow_id == flow.id, TenantRoutingConfig.channel_connection_id.is_not(None), TenantRoutingConfig.channel_connection_id != target).first():
                raise HTTPException(409, "This flow is used by another channel. Remove those links before reassigning it.")
            if db.query(FlowSession).filter(FlowSession.flow_id == flow.id, FlowSession.status.in_(["active", "waiting"])).first():
                raise HTTPException(409, "This flow has running conversations. Wait for them to finish before changing its channel.")
        flow.channel_connection_id = channel.id
        flow.channels = ["messenger" if str(channel.channel_type) == "facebook" else str(channel.channel_type)]
    if "name" in changes and changes["name"] is not None:
        flow.name = changes["name"]
    if "status" in changes and changes["status"] is not None:
        flow.status = data.status.value
    if "channels" in changes and changes["channels"] is not None and target is None:
        flow.channels = changes["channels"]
    if "nodes" in changes and changes["nodes"] is not None:
        flow.nodes = changes["nodes"]
    if "edges" in changes and changes["edges"] is not None:
        flow.edges = changes["edges"]
    db.commit()
    db.refresh(flow)
    return flow


def delete_flow(db: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID) -> None:
    flow = _get(db, tenant_id, flow_id, for_update=True)
    db.delete(flow)
    db.commit()


def copy_flow(db: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID, user) -> Flow:
    src = _get(db, tenant_id, flow_id)
    clone = Flow(
        tenant_id=tenant_id,
        name=_copy_name(db, tenant_id, src.name),
        status=FlowStatus.DRAFT.value,
        channels=list(src.channels or []),
        channel_connection_id=src.channel_connection_id,
        nodes=list(src.nodes or []),
        edges=list(src.edges or []),
        created_by_user_id=getattr(user, "id", None),
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


def _copy_name(db: Session, tenant_id: uuid.UUID, name: str) -> str:
    candidate = f"{name} (copy)"[:150]
    exists = db.execute(select(Flow.id).where(Flow.tenant_id == tenant_id, Flow.name == candidate)).scalar_one_or_none()
    if not exists:
        return candidate
    return f"{name} (copy {uuid.uuid4().hex[:4]})"[:150]


def _default_channel(channels: list[str]) -> str:
    if not channels or "omnichannel" in channels:
        return "whatsapp"
    return channels[0]
