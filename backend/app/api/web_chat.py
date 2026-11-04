import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies import CurrentTenant, CurrentUser, DbSession, require_permission
from app.schemas.web_chat_pairing import (
    WebChatSetupRequest, WebChatPairingStart, WebChatPairingComplete, WebChatPairingCancel,
    WebChatPairingResponse, WebChatInstallationResponse, WebChatWidgetSettings,
)
from app.services import web_chat_pairing_service as pairing_service
from app.schemas.channel import ChannelConnectionResponse
from app.schemas.web_chat import (
    WebChatConfigResponse,
    WebChatInboundRequest,
    WebChatInboundResponse,
    WebChatMessagesResponse,
)
from app.services import web_chat_service
from app.services.web_chat_service import (
    NotWebChatChannelError,
    WebChatChannelNotFoundError,
    WebChatError,
)

logger = logging.getLogger(__name__)

# Public widget keys are "wc_" + url-safe token.
PUBLIC_KEY = Path(..., min_length=8, max_length=255, pattern=r"^[A-Za-z0-9._\-]+$")

router = APIRouter(tags=["Web Chat"])


@contextmanager
def _handle_errors() -> Iterator[None]:
    try:
        yield
    except pairing_service.PairingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    except WebChatChannelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except NotWebChatChannelError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    except WebChatError:
        # Never expose internal detail to a public caller.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message could not be processed.")
    except SQLAlchemyError:
        logger.error("Database error in Web Chat endpoint.")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service temporarily unavailable.")


# =========================
# DASHBOARD (authenticated)
# =========================

@router.post("/channels/web-chat/setup", response_model=ChannelConnectionResponse,
             dependencies=[Depends(require_permission("channel:create"))], status_code=201)
def setup_web_chat(data: WebChatSetupRequest, tenant: CurrentTenant, user: CurrentUser, db: DbSession):
    with _handle_errors():
        return pairing_service.create_website_channel(db, tenant.id, user.id, data)


@router.patch("/channels/{channel_id}/web-chat/website", response_model=ChannelConnectionResponse,
            dependencies=[Depends(require_permission("channel:update"))])
def save_web_chat_website(channel_id: uuid.UUID, data: WebChatSetupRequest, tenant: CurrentTenant, db: DbSession):
    with _handle_errors():
        return pairing_service.save_website(db, tenant.id, channel_id, data)


@router.post("/channels/{channel_id}/web-chat/pairing", response_model=WebChatPairingResponse,
             dependencies=[Depends(require_permission("channel:update"))])
def start_web_chat_pairing(channel_id: uuid.UUID, data: WebChatPairingStart, tenant: CurrentTenant, user: CurrentUser, db: DbSession, response: Response):
    with _handle_errors():
        response.headers["Cache-Control"] = "no-store"
        return pairing_service.start_pairing(db, tenant.id, user.id, channel_id, data.opener_origin)


@router.get("/channels/{channel_id}/web-chat/installation", response_model=WebChatInstallationResponse,
            dependencies=[Depends(require_permission("channel:read"))])
def web_chat_installation(channel_id: uuid.UUID, tenant: CurrentTenant, db: DbSession):
    with _handle_errors():
        return pairing_service.installation(db, tenant.id, channel_id)


@router.get("/channels/{channel_id}/web-chat/widget-settings", response_model=WebChatWidgetSettings,
            dependencies=[Depends(require_permission("channel:read"))])
def web_chat_widget_settings(channel_id: uuid.UUID, tenant: CurrentTenant, db: DbSession, response: Response):
    with _handle_errors():
        response.headers["Cache-Control"] = "no-store"
        return pairing_service.widget_settings(db, tenant.id, channel_id)


@router.post("/channels/{channel_id}/web-chat/pairing/cancel", response_model=WebChatInstallationResponse,
             dependencies=[Depends(require_permission("channel:update"))])
def cancel_web_chat_pairing(channel_id: uuid.UUID, data: WebChatPairingCancel, tenant: CurrentTenant, db: DbSession):
    with _handle_errors():
        return pairing_service.cancel_pairing(db, tenant.id, channel_id, data.pairing_id)


@router.post("/web-chat/pairings/{pairing_id}/complete")
def complete_web_chat_pairing(pairing_id: uuid.UUID, data: WebChatPairingComplete, db: DbSession):
    with _handle_errors():
        return pairing_service.complete_pairing(db, pairing_id, data)

@router.post(
    "/channels/{channel_id}/web-chat/connect",
    response_model=ChannelConnectionResponse,
    dependencies=[Depends(require_permission("channel:update"))],
)
def connect_web_chat(channel_id: uuid.UUID, tenant: CurrentTenant, db: DbSession):
    with _handle_errors():
        return web_chat_service.connect_web_chat_channel(db, tenant.id, channel_id)


# =========================
# PUBLIC WIDGET (no auth; tenant/channel derived from the public key)
# =========================

@router.get("/web-chat/{public_key}/config", response_model=WebChatConfigResponse)
def web_chat_config(db: DbSession, public_key: str = PUBLIC_KEY):
    with _handle_errors():
        return web_chat_service.get_config(db, public_key)


@router.post(
    "/web-chat/{public_key}/messages",
    response_model=WebChatInboundResponse,
    status_code=status.HTTP_201_CREATED,
)
def web_chat_inbound(data: WebChatInboundRequest, db: DbSession, public_key: str = PUBLIC_KEY):
    with _handle_errors():
        return web_chat_service.process_inbound(db, public_key, data)


@router.get("/web-chat/{public_key}/messages", response_model=WebChatMessagesResponse)
def web_chat_messages(
    db: DbSession,
    public_key: str = PUBLIC_KEY,
    visitor_id: str = Query(..., min_length=1, max_length=200),
    after: datetime | None = Query(default=None),
):
    with _handle_errors():
        return web_chat_service.list_visitor_messages(db, public_key, visitor_id, after)
