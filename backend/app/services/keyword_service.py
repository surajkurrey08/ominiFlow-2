import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Flow
from app.models.keyword import Keyword
from app.schemas.keyword import KeywordCreate, KeywordResponse, KeywordUpdate
from app.services.channel_scope_service import owned_channel, require_flow_channel

VALID_MATCH_TYPES = {"exact", "contains", "starts_with", "ends_with"}


def _validate_flow(session: Session, tenant_id: uuid.UUID, flow_id: uuid.UUID | None, channel_id) -> None:
    """A keyword may only reference a flow owned by the same tenant."""
    if flow_id is None:
        return
    require_flow_channel(session, tenant_id, flow_id, channel_id)


def _flow_names(session: Session, tenant_id: uuid.UUID, flow_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    ids = [fid for fid in flow_ids if fid]
    if not ids:
        return {}
    rows = session.execute(select(Flow.id, Flow.name).where(Flow.tenant_id == tenant_id, Flow.id.in_(ids))).all()
    return {row[0]: row[1] for row in rows}


def _channel_names(session: Session, tenant_id: uuid.UUID, channel_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    from app.models import ChannelConnection
    ids = [cid for cid in channel_ids if cid]
    if not ids:
        return {}
    rows = session.execute(
        select(ChannelConnection.id, ChannelConnection.name)
        .where(ChannelConnection.tenant_id == tenant_id, ChannelConnection.id.in_(ids))
    ).all()
    return {row[0]: row[1] for row in rows}


def _serialize(kw: Keyword, flow_name: str | None, channel_name: str | None = None) -> KeywordResponse:
    data = KeywordResponse.model_validate(kw)
    data.flow_name = flow_name
    data.channel_name = channel_name
    return data


def list_keywords(
    session: Session,
    tenant_id: uuid.UUID,
    search: str | None = None,
    match_type: str | None = None,
    is_active: bool | None = None,
    channel_connection_id: uuid.UUID | None = None,
) -> list[KeywordResponse]:
    query = select(Keyword).where(Keyword.tenant_id == tenant_id)
    if search:
        query = query.where(Keyword.keyword_text.ilike(f"%{search}%"))
    if match_type in VALID_MATCH_TYPES:
        query = query.where(Keyword.match_type == match_type)
    if is_active is not None:
        query = query.where(Keyword.is_active.is_(is_active))
    if channel_connection_id is not None:
        owned_channel(session, tenant_id, channel_connection_id)
        query = query.where(Keyword.channel_connection_id == channel_connection_id)
    keywords = session.execute(query.order_by(Keyword.created_at.desc())).scalars().all()
    names = _flow_names(session, tenant_id, [k.flow_id for k in keywords])
    chan_names = _channel_names(session, tenant_id, [k.channel_connection_id for k in keywords])
    return [_serialize(k, names.get(k.flow_id) if k.flow_id else None,
                       chan_names.get(k.channel_connection_id) if k.channel_connection_id else None)
            for k in keywords]


def get_keyword_model(session: Session, tenant_id: uuid.UUID, keyword_id: uuid.UUID) -> Keyword:
    keyword = session.execute(
        select(Keyword).where(Keyword.tenant_id == tenant_id, Keyword.id == keyword_id)
    ).scalar_one_or_none()
    if not keyword:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Keyword not found")
    return keyword


def get_keyword(session: Session, tenant_id: uuid.UUID, keyword_id: uuid.UUID) -> KeywordResponse:
    keyword = get_keyword_model(session, tenant_id, keyword_id)
    names = _flow_names(session, tenant_id, [keyword.flow_id])
    chan_names = _channel_names(session, tenant_id, [keyword.channel_connection_id])
    return _serialize(
        keyword,
        names.get(keyword.flow_id) if keyword.flow_id else None,
        chan_names.get(keyword.channel_connection_id) if keyword.channel_connection_id else None,
    )


def create_keyword(session: Session, tenant_id: uuid.UUID, user_id: uuid.UUID, data: KeywordCreate) -> KeywordResponse:
    owned_channel(session, tenant_id, data.channel_connection_id)
    existing = session.execute(
        select(Keyword).where(
            Keyword.tenant_id == tenant_id,
            Keyword.keyword_text == data.keyword_text,
            Keyword.match_type == data.match_type,
            Keyword.channel_connection_id == data.channel_connection_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keyword with this text and match type already exists for this channel")

    _validate_flow(session, tenant_id, data.flow_id, data.channel_connection_id)

    keyword = Keyword(
        tenant_id=tenant_id,
        keyword_text=data.keyword_text,
        match_type=data.match_type,
        is_active=data.is_active,
        flow_id=data.flow_id,
        reply_text=data.reply_text,
        channel_connection_id=data.channel_connection_id,
        created_by_user_id=user_id,
    )
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return get_keyword(session, tenant_id, keyword.id)


def update_keyword(session: Session, tenant_id: uuid.UUID, keyword_id: uuid.UUID, data: KeywordUpdate) -> KeywordResponse:
    keyword = get_keyword_model(session, tenant_id, keyword_id)
    update_data = data.model_dump(exclude_unset=True)

    if "keyword_text" in update_data or "match_type" in update_data or "channel_connection_id" in update_data:
        check_text = update_data.get("keyword_text", keyword.keyword_text)
        check_match = update_data.get("match_type", keyword.match_type)
        check_channel = update_data.get("channel_connection_id", keyword.channel_connection_id)
        if (check_text != keyword.keyword_text or check_match != keyword.match_type
                or check_channel != keyword.channel_connection_id):
            existing = session.execute(
                select(Keyword).where(
                    Keyword.tenant_id == tenant_id,
                    Keyword.keyword_text == check_text,
                    Keyword.match_type == check_match,
                    Keyword.channel_connection_id == check_channel,
                    Keyword.id != keyword_id,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keyword with this text and match type already exists for this channel")

    target_channel = update_data.get("channel_connection_id", keyword.channel_connection_id)
    if target_channel is not None or update_data.get("is_active", keyword.is_active):
        owned_channel(session, tenant_id, target_channel)
        _validate_flow(session, tenant_id, update_data.get("flow_id", keyword.flow_id), target_channel)
    elif "channel_connection_id" in update_data:
        raise HTTPException(422, "Select a channel. A rule cannot be changed to all channels.")

    for key, value in update_data.items():
        setattr(keyword, key, value)

    session.commit()
    session.refresh(keyword)
    return get_keyword(session, tenant_id, keyword.id)


def delete_keyword(session: Session, tenant_id: uuid.UUID, keyword_id: uuid.UUID) -> None:
    keyword = get_keyword_model(session, tenant_id, keyword_id)
    session.delete(keyword)
    session.commit()
