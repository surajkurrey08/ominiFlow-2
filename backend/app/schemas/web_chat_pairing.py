import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WebChatSetupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    website_url: str = Field(min_length=8, max_length=2048)
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WebChatWidgetSettings(BaseModel):
    channel_id: uuid.UUID
    frontend_url: str
    backend_url: str
    public_key: str


class WebChatPairingStart(BaseModel):
    opener_origin: str = Field(min_length=8, max_length=2048)
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WebChatPairingComplete(BaseModel):
    token: str = Field(min_length=40, max_length=128)
    website_origin: str = Field(min_length=8, max_length=2048)
    plugin_revision: int = Field(ge=1)
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WebChatPairingCancel(BaseModel):
    pairing_id: uuid.UUID
    model_config = ConfigDict(extra="forbid")


class WebChatPairingResponse(BaseModel):
    pairing_id: uuid.UUID
    channel_id: uuid.UUID
    channel_name: str
    website_origin: str
    authorization_url: str
    frontend_url: str
    backend_url: str
    public_key: str
    token: str
    expires_at: datetime
    protocol: Literal["omniflow-pairing-v1"] = "omniflow-pairing-v1"


class WebChatInstallationResponse(BaseModel):
    channel_id: uuid.UUID
    website_url: str | None = None
    installation_status: Literal["not_connected", "awaiting_approval", "expired", "authorized", "active", "disconnected"]
    paired_at: datetime | None = None
    last_visitor_message_at: datetime | None = None
    last_agent_message_at: datetime | None = None
    pairing_id: uuid.UUID | None = None
    expires_at: datetime | None = None
