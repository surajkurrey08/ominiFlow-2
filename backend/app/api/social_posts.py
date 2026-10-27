import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import CurrentTenant, DbSession
from app.schemas.social_post import (
    SocialPostCreate,
    SocialPostUpdate,
    SocialPostResponse,
    SocialPostListResponse,
    SocialPostOverviewResponse,
    GenerateCaptionRequest,
)
from app.services import social_post_service

router = APIRouter(prefix="/social-posts", tags=["Social Posts"])


def _to_response(post: Any) -> SocialPostResponse:
    channel_name = None
    if getattr(post, "channel_connection", None):
        channel_name = post.channel_connection.name

    return SocialPostResponse(
        id=post.id,
        tenant_id=post.tenant_id,
        channel_connection_id=post.channel_connection_id,
        channel_name=channel_name,
        caption=post.caption,
        media_urls=post.media_urls or [],
        platforms=post.platforms or [],
        format=post.format or "post",
        tags=post.tags or [],
        status=post.status,
        scheduled_at=post.scheduled_at,
        published_at=post.published_at,
        external_post_id=post.external_post_id,
        error_message=post.error_message,
        analytics=post.analytics or {},
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


@router.get("/overview", response_model=SocialPostOverviewResponse)
def get_overview(
    tenant: CurrentTenant,
    db: DbSession,
) -> Any:
    data = social_post_service.get_overview(db, tenant.id)
    return SocialPostOverviewResponse(
        published_this_month=data["published_this_month"],
        scheduled_count=data["scheduled_count"],
        connected_accounts_count=data["connected_accounts_count"],
        draft_count=data["draft_count"],
        total_successful_posts=data["total_successful_posts"],
        recent_posts=[_to_response(p) for p in data["recent_posts"]],
    )


@router.get("", response_model=SocialPostListResponse)
def list_posts(
    tenant: CurrentTenant,
    db: DbSession,
    status: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> Any:
    items, total = social_post_service.list_posts(
        db, tenant.id, status=status, platform=platform, search=search, page=page, size=size
    )
    return SocialPostListResponse(
        items=[_to_response(p) for p in items],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{post_id}", response_model=SocialPostResponse)
def get_post(
    post_id: uuid.UUID,
    tenant: CurrentTenant,
    db: DbSession,
) -> Any:
    post = social_post_service.get_post(db, tenant.id, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Social post not found")
    return _to_response(post)


@router.post("", response_model=SocialPostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    data: SocialPostCreate,
    tenant: CurrentTenant,
    db: DbSession,
) -> Any:
    post = social_post_service.create_post(db, tenant.id, data)
    return _to_response(post)


@router.patch("/{post_id}", response_model=SocialPostResponse)
def update_post(
    post_id: uuid.UUID,
    data: SocialPostUpdate,
    tenant: CurrentTenant,
    db: DbSession,
) -> Any:
    post = social_post_service.update_post(db, tenant.id, post_id, data)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Social post not found")
    return _to_response(post)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: uuid.UUID,
    tenant: CurrentTenant,
    db: DbSession,
) -> None:
    if not social_post_service.delete_post(db, tenant.id, post_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Social post not found")


@router.post("/{post_id}/publish", response_model=SocialPostResponse)
def publish_post(
    post_id: uuid.UUID,
    tenant: CurrentTenant,
    db: DbSession,
) -> Any:
    post = social_post_service.get_post(db, tenant.id, post_id)
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Social post not found")
    published = social_post_service.publish_post(db, post)
    return _to_response(published)


@router.post("/generate-caption")
def generate_caption(
    data: GenerateCaptionRequest,
    tenant: CurrentTenant,
) -> Any:
    caption = social_post_service.generate_ai_caption(
        instruction=data.instruction or "",
        topic=data.topic or "",
        tone=data.tone or "balanced",
    )
    return {"caption": caption}
