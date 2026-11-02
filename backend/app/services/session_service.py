"""Login-only refresh rotation. Tenant and user permissions are checked afresh."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import Role, SessionRefreshToken, Tenant, TenantMembership, User, UserSession

# Concurrent tabs/SSR requests may arrive with the same cookie. They receive
# the same successor for a short window; a later replay revokes the session.
ROTATION_GRACE_SECONDS = 10


class InvalidRefreshTokenError(Exception):
    pass


def _now():
    return datetime.now(timezone.utc)


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def _successor(raw):
    return hmac.new(settings.jwt_secret.encode(), b"session-refresh-v1:" + raw.encode(), hashlib.sha256).hexdigest()


def _tokens(session, tenant_id, raw, expires_at):
    now = _now()
    access = create_access_token(
        subject=str(session.user_id),
        expires_minutes=settings.session_access_token_expire_minutes,
        extra_claims={
            "tenant_id": str(tenant_id),
            "session_id": str(session.id),
            "refreshable": True,
            "exp": min(now + timedelta(minutes=settings.session_access_token_expire_minutes), _utc(expires_at)),
        },
    )
    return {
        "access_token": access, "token_type": "bearer",
        "refresh_token": raw, "refresh_expires_at": _utc(expires_at),
    }


def issue_session_tokens(db: Session, session: UserSession, tenant_id):
    db.flush()
    raw = secrets.token_urlsafe(48)
    expires_at = _utc(session.created_at) + timedelta(days=settings.refresh_token_expire_days)
    db.add(SessionRefreshToken(
        token_hash=_digest(raw), session_id=session.id, tenant_id=tenant_id,
        expires_at=expires_at,
    ))
    return _tokens(session, tenant_id, raw, expires_at)


def _locked_session(db, raw):
    record = db.get(SessionRefreshToken, _digest(raw))
    if record is None:
        raise InvalidRefreshTokenError()
    session = db.scalar(select(UserSession).where(UserSession.id == record.session_id).with_for_update().execution_options(populate_existing=True))
    # Refresh ORM state after acquiring the cross-worker lock.
    db.refresh(record)
    return record, session


def refresh_session(db: Session, raw: str):
    record, session = _locked_session(db, raw)
    now = _now()
    if session is None or not session.is_active:
        raise InvalidRefreshTokenError()
    expired = _utc(record.expires_at) <= now
    idle = now - _utc(session.last_active_at) > timedelta(hours=settings.session_inactivity_timeout_hours)
    if expired or idle:
        session.is_active = False
        db.commit()
        raise InvalidRefreshTokenError()

    user = db.get(User, session.user_id)
    tenant = db.get(Tenant, record.tenant_id)
    membership = db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == session.user_id,
        TenantMembership.tenant_id == record.tenant_id,
        TenantMembership.status == "active",
    ))
    role = db.get(Role, membership.role_id) if membership else None
    if not user or not user.is_active or not tenant or not tenant.is_active or tenant.is_deleted or not role or not role.is_active:
        session.is_active = False
        db.commit()
        raise InvalidRefreshTokenError()

    if record.consumed_at is not None:
        if now - _utc(record.consumed_at) > timedelta(seconds=ROTATION_GRACE_SECONDS):
            session.is_active = False
            db.commit()
            raise InvalidRefreshTokenError()
        # Follow a bounded chain when several concurrent requests have rotated.
        for _ in range(16):
            if record.consumed_at is None:
                break
            raw = _successor(raw)
            if not hmac.compare_digest(_digest(raw), record.successor_hash or ""):
                raise InvalidRefreshTokenError()
            record = db.get(SessionRefreshToken, record.successor_hash)
            if record is None:
                raise InvalidRefreshTokenError()
        else:
            raise InvalidRefreshTokenError()
    else:
        next_raw = _successor(raw)
        record.consumed_at = now
        record.successor_hash = _digest(next_raw)
        db.add(SessionRefreshToken(
            token_hash=record.successor_hash, session_id=session.id,
            tenant_id=record.tenant_id, expires_at=record.expires_at,
        ))
        raw = next_raw

    result = _tokens(session, record.tenant_id, raw, record.expires_at)
    # Rotation alone is not user activity and must not extend the idle window.
    db.commit()
    return result


def revoke_refresh_session(db: Session, raw: str):
    try:
        _, session = _locked_session(db, raw)
    except InvalidRefreshTokenError:
        return
    if session is not None:
        session.is_active = False
        db.commit()
