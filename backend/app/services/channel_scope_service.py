"""Business-channel ownership shared by flow CRUD, rules and runtime delivery."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ChannelConnection, Flow


def owned_channel(db: Session, tenant_id, channel_id):
    if channel_id is None:
        raise HTTPException(422, "Select a channel for this flow or keyword.")
    channel = db.query(ChannelConnection).filter_by(
        id=channel_id, tenant_id=tenant_id, is_deleted=False,
    ).first()
    if channel is None:
        raise HTTPException(404, "Channel not found in this workspace.")
    return channel


def flow_matches_channel(flow, tenant_id, channel_id):
    return (flow is not None and channel_id is not None
            and flow.tenant_id == tenant_id and flow.channel_connection_id == channel_id)


def require_flow_channel(db: Session, tenant_id, flow_id, channel_id):
    flow = db.query(Flow).filter_by(id=flow_id, tenant_id=tenant_id).with_for_update().first()
    if flow is None:
        raise HTTPException(400, "Selected flow does not exist for this workspace.")
    if not flow_matches_channel(flow, tenant_id, channel_id):
        raise HTTPException(422, "Choose a flow assigned to the same channel as this keyword or default reply.")
    return flow
