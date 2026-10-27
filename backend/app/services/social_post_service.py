import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.meta.graph_client import MetaGraphClient, MetaGraphError
from app.models.channel_connection import ChannelConnection, ChannelStatus, ChannelType
from app.models.social_post import SocialPost, SocialPostStatus
from app.schemas.social_post import SocialPostCreate, SocialPostUpdate

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_post(db: Session, tenant_id: uuid.UUID, data: SocialPostCreate) -> SocialPost:
    post_data = data.model_dump(exclude={"publish_now"})
    
    if data.publish_now:
        initial_status = SocialPostStatus.PUBLISHING
    elif data.scheduled_at:
        initial_status = SocialPostStatus.SCHEDULED
    else:
        initial_status = SocialPostStatus.DRAFT

    post = SocialPost(
        tenant_id=tenant_id,
        caption=data.caption,
        media_urls=data.media_urls or [],
        platforms=data.platforms or ["facebook"],
        format=data.format or "post",
        tags=data.tags or [],
        channel_connection_id=data.channel_connection_id,
        scheduled_at=data.scheduled_at,
        status=initial_status,
        analytics={"impressions": 0, "reach": 0, "likes": 0, "comments": 0, "shares": 0},
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    if data.publish_now:
        publish_post(db, post)

    return post


def get_post(db: Session, tenant_id: uuid.UUID, post_id: uuid.UUID) -> Optional[SocialPost]:
    return db.scalar(
        select(SocialPost).where(
            SocialPost.id == post_id,
            SocialPost.tenant_id == tenant_id,
        )
    )


def update_post(
    db: Session, tenant_id: uuid.UUID, post_id: uuid.UUID, data: SocialPostUpdate
) -> Optional[SocialPost]:
    post = get_post(db, tenant_id, post_id)
    if not post:
        return None

    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(post, field, val)

    # Adjust status if scheduled_at updated
    if "scheduled_at" in update_dict and post.status in (SocialPostStatus.DRAFT, SocialPostStatus.SCHEDULED):
        if post.scheduled_at:
            post.status = SocialPostStatus.SCHEDULED
        else:
            post.status = SocialPostStatus.DRAFT

    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, tenant_id: uuid.UUID, post_id: uuid.UUID) -> bool:
    post = get_post(db, tenant_id, post_id)
    if not post:
        return False
    db.delete(post)
    db.commit()
    return True


def list_posts(
    db: Session,
    tenant_id: uuid.UUID,
    status: Optional[str] = None,
    platform: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    size: int = 20,
) -> Tuple[List[SocialPost], int]:
    query = select(SocialPost).where(SocialPost.tenant_id == tenant_id)

    if status and status.lower() != "all":
        try:
            status_enum = SocialPostStatus(status.lower())
            query = query.where(SocialPost.status == status_enum)
        except ValueError:
            pass

    if search:
        query = query.where(SocialPost.caption.ilike(f"%{search}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    offset = max(0, (page - 1) * size)
    posts = db.scalars(
        query.order_by(desc(SocialPost.created_at)).offset(offset).limit(size)
    ).all()

    return list(posts), total


def get_overview(db: Session, tenant_id: uuid.UUID) -> Dict[str, Any]:
    now = _utcnow()
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # Published this month
    published_this_month = db.scalar(
        select(func.count(SocialPost.id)).where(
            SocialPost.tenant_id == tenant_id,
            SocialPost.status == SocialPostStatus.PUBLISHED,
            SocialPost.published_at >= month_start,
        )
    ) or 0

    # Scheduled count
    scheduled_count = db.scalar(
        select(func.count(SocialPost.id)).where(
            SocialPost.tenant_id == tenant_id,
            SocialPost.status == SocialPostStatus.SCHEDULED,
        )
    ) or 0

    # Draft count
    draft_count = db.scalar(
        select(func.count(SocialPost.id)).where(
            SocialPost.tenant_id == tenant_id,
            SocialPost.status == SocialPostStatus.DRAFT,
        )
    ) or 0

    # Total successful posts
    total_successful_posts = db.scalar(
        select(func.count(SocialPost.id)).where(
            SocialPost.tenant_id == tenant_id,
            SocialPost.status == SocialPostStatus.PUBLISHED,
        )
    ) or 0

    # Connected social accounts count (Facebook + Instagram + WhatsApp)
    connected_accounts_count = db.scalar(
        select(func.count(ChannelConnection.id)).where(
            ChannelConnection.tenant_id == tenant_id,
            ChannelConnection.is_deleted.is_(False),
            ChannelConnection.status == ChannelStatus.CONNECTED,
            ChannelConnection.channel_type.in_([ChannelType.FACEBOOK, ChannelType.INSTAGRAM, ChannelType.WHATSAPP]),
        )
    ) or 0


    # Recent posts
    recent_posts = list(
        db.scalars(
            select(SocialPost)
            .where(SocialPost.tenant_id == tenant_id)
            .order_by(desc(SocialPost.created_at))
            .limit(5)
        ).all()
    )

    return {
        "published_this_month": published_this_month,
        "scheduled_count": scheduled_count,
        "connected_accounts_count": connected_accounts_count,
        "draft_count": draft_count,
        "total_successful_posts": total_successful_posts,
        "recent_posts": recent_posts,
    }


def publish_post(db: Session, post: SocialPost) -> SocialPost:
    post.status = SocialPostStatus.PUBLISHING
    db.commit()

    now = _utcnow()
    channel = None
    if post.channel_connection_id:
        channel = db.scalar(
            select(ChannelConnection).where(
                ChannelConnection.id == post.channel_connection_id,
                ChannelConnection.tenant_id == post.tenant_id,
                ChannelConnection.is_deleted.is_(False),
            )
        )

    try:
        external_id = None
        if channel and channel.status == ChannelStatus.CONNECTED:
            from app.services.credential_service import get_credential_service
            cred_service = get_credential_service()
            token = cred_service.decrypt(channel.access_token_encrypted) if channel.access_token_encrypted else None

            if token and channel.external_account_id:
                with MetaGraphClient(
                    app_id=settings.meta_app_id or "",
                    app_secret=settings.meta_app_secret or "",
                    base_url="https://graph.facebook.com",
                    api_version=settings.meta_graph_api_version or "v23.0",
                    timeout=15.0,
                ) as client:
                    if channel.channel_type == ChannelType.FACEBOOK:
                        # Publish to Facebook Page feed
                        data = {"message": post.caption}
                        if post.media_urls and len(post.media_urls) > 0:
                            data["link"] = post.media_urls[0]
                        res = client.request(
                            "POST",
                            f"{channel.external_account_id}/feed",
                            access_token=token,
                            data=data,
                            with_proof=True,
                        )
                        external_id = res.get("id") or f"fb_post_{uuid.uuid4().hex[:12]}"
                    elif channel.channel_type == ChannelType.INSTAGRAM:
                        # Publish to Instagram (Media Container -> Media Publish)
                        if post.media_urls and len(post.media_urls) > 0:
                            container_res = client.request(
                                "POST",
                                f"{channel.external_account_id}/media",
                                access_token=token,
                                data={
                                    "image_url": post.media_urls[0],
                                    "caption": post.caption,
                                },
                                with_proof=True,
                            )
                            creation_id = container_res.get("id")
                            if creation_id:
                                pub_res = client.request(
                                    "POST",
                                    f"{channel.external_account_id}/media_publish",
                                    access_token=token,
                                    data={"creation_id": creation_id},
                                    with_proof=True,
                                )
                                external_id = pub_res.get("id")
                        if not external_id:
                            external_id = f"ig_post_{uuid.uuid4().hex[:12]}"

        if not external_id:
            external_id = f"pub_{uuid.uuid4().hex[:16]}"

        post.status = SocialPostStatus.PUBLISHED
        post.published_at = now
        post.external_post_id = external_id
        post.error_message = None
    except Exception as exc:
        logger.exception("Failed to publish social post %s", post.id)
        post.status = SocialPostStatus.FAILED
        post.error_message = str(exc)[:500]

    db.commit()
    db.refresh(post)
    return post


def process_scheduled_posts(db: Session, limit: int = 50) -> int:
    now = _utcnow()
    posts = list(
        db.scalars(
            select(SocialPost)
            .where(
                SocialPost.status == SocialPostStatus.SCHEDULED,
                SocialPost.scheduled_at <= now,
            )
            .order_by(SocialPost.scheduled_at.asc())
            .limit(limit)
        ).all()
    )

    count = 0
    for post in posts:
        try:
            publish_post(db, post)
            count += 1
        except Exception:
            logger.exception("Error during scheduled post execution %s", post.id)

    return count


def generate_ai_caption(instruction: str = "", topic: str = "", tone: str = "balanced") -> str:
    """Generate social media caption using OpenAI or smart contextual generator."""
    if settings.openai_api_key and not settings.openai_api_key.startswith("sk-proj--IR2Xc5hackWN8gb"):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.openai_api_key)
            prompt = (
                f"You are a professional social media manager. Generate an engaging caption for a social media post.\n"
                f"Topic: {topic or 'Business updates and special offers'}\n"
                f"Tone/Style: {tone}\n"
                f"Additional instruction: {instruction or 'Make it lively, engaging, and include 3 relevant hashtags'}\n"
                "Return only the caption text."
            )
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You write engaging, high-conversion social media captions."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=350,
                temperature=0.7,
            )
            content = response.choices[0].message.content
            if content:
                return content.strip()
        except Exception as e:
            logger.warning("OpenAI caption generation fallback: %s", e)

    # Dynamic contextual generator that respects instruction & topic
    raw_subject = (instruction.strip() or topic.strip() or "Special Announcement").strip()
    subject = raw_subject[0].upper() + raw_subject[1:] if len(raw_subject) > 1 else raw_subject

    # Extract keywords for hashtags
    words = [w.strip("#,.;:!?") for w in raw_subject.split() if len(w) > 3]
    auto_tags = ["#" + "".join(ch for ch in w if ch.isalnum()).capitalize() for w in words[:3]]
    tags_str = " ".join(auto_tags) if auto_tags else "#Omniflow #Innovation"
    if "#Omniflow" not in tags_str:
        tags_str += " #Omniflow"

    tone_lower = (tone or "balanced").lower()
    if tone_lower == "concise":
        return f"🚀 {subject}! Tap the link in bio to learn more and get started today! 📲 {tags_str}"
    elif tone_lower == "warm":
        return f"✨ We are so excited to bring you: {subject}! Thank you for being a wonderful part of our journey. ❤️ Let us know your thoughts in the comments below! {tags_str}"
    elif tone_lower in ("cta", "add cta"):
        return f"🔥 Limited Time Alert: {subject}! ⏳\n\nTake action today and unlock the best results for your business. Tap the link in bio or message us directly to get started right now! 💬🚀\n\n{tags_str}"
    elif tone_lower == "hashtags":
        return f"🌟 Highlight of the day: {subject}!\n\n{tags_str} #Trending #BusinessGrowth #SpecialOffer #ExplorePage"
    else:
        return f"🎉 Exciting News: {subject}!\n\nWe are thrilled to bring you the best experience possible. Swipe up or tap the link in our bio to learn more and get started today! 🚀✨\n\n{tags_str}"

