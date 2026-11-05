import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentTenant, get_db, require_permission
from app.models import Flow, TenantRoutingConfig
from app.schemas.routing import RoutingConfigResponse, RoutingConfigUpdate
from app.services.channel_scope_service import owned_channel, require_flow_channel

router = APIRouter(prefix="/routing-config", tags=["Routing"])


@router.get("", response_model=RoutingConfigResponse)
def get_routing_config(
    tenant: CurrentTenant,
    db: Session = Depends(get_db),
    _=Depends(require_permission("tenant:update")),
    channel_connection_id: uuid.UUID | None = Query(None),
):
    """Read this channel's config; missing settings never inherit another business's defaults."""
    if channel_connection_id is not None:
        owned_channel(db, tenant.id, channel_connection_id)
        config = (
            db.query(TenantRoutingConfig)
            .filter(
                TenantRoutingConfig.tenant_id == tenant.id,
                TenantRoutingConfig.channel_connection_id == channel_connection_id,
            )
            .first()
        )
        if config is not None:
            return config
        return RoutingConfigResponse(fallback_action="none", channel_connection_id=channel_connection_id)
    # Global (channel_connection_id IS NULL)
    config = (
        db.query(TenantRoutingConfig)
        .filter(
            TenantRoutingConfig.tenant_id == tenant.id,
            TenantRoutingConfig.channel_connection_id.is_(None),
        )
        .first()
    )
    if config is None:
        return RoutingConfigResponse(fallback_action="none", fallback_flow_id=None, channel_connection_id=None)
    return config


@router.put("", response_model=RoutingConfigResponse)
def update_routing_config(
    data: RoutingConfigUpdate,
    tenant: CurrentTenant,
    db: Session = Depends(get_db),
    _=Depends(require_permission("tenant:update")),
):
    """Set the routing config. When action is ``flow`` the flow must
    belong to this tenant. If ``channel_connection_id`` is provided in the
    body, upserts the channel-specific config; otherwise upserts the global one.
    """
    owned_channel(db, tenant.id, data.channel_connection_id)
    flow_id = data.fallback_flow_id
    if data.fallback_action == "flow" or flow_id is not None:
        if data.fallback_action == "flow" and flow_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A flow must be selected when the fallback action is 'flow'.",
            )
        flow = db.query(Flow).filter(Flow.id == flow_id, Flow.tenant_id == tenant.id).first()
        if flow is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow not found.")
        require_flow_channel(db, tenant.id, flow_id, data.channel_connection_id)
    else:
        flow_id = None

    channel_connection_id = data.channel_connection_id

    if channel_connection_id is not None:
        config = (
            db.query(TenantRoutingConfig)
            .filter(
                TenantRoutingConfig.tenant_id == tenant.id,
                TenantRoutingConfig.channel_connection_id == channel_connection_id,
            )
            .with_for_update()
            .first()
        )
        if config is None:
            config = TenantRoutingConfig(tenant_id=tenant.id, channel_connection_id=channel_connection_id)
            db.add(config)
    else:
        config = (
            db.query(TenantRoutingConfig)
            .filter(
                TenantRoutingConfig.tenant_id == tenant.id,
                TenantRoutingConfig.channel_connection_id.is_(None),
            )
            .with_for_update()
            .first()
        )
        if config is None:
            config = TenantRoutingConfig(tenant_id=tenant.id, channel_connection_id=None)
            db.add(config)

    if data.expected_updated_at is not None and config.updated_at is not None and config.updated_at != data.expected_updated_at:
        raise HTTPException(409, "Settings changed in another session. Reload saved settings before saving again.")
    config.fallback_action = data.fallback_action
    config.fallback_flow_id = flow_id
    # Older clients update routing only; do not erase the assistant's knowledge.
    for field in ("flow_ai_enabled", "ai_instructions", "ai_knowledge", "ai_unavailable_reply"):
        if field in data.model_fields_set:
            setattr(config, field, getattr(data, field))
    db.commit()
    db.refresh(config)
    return config
