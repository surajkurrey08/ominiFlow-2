from typing import Literal
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssistantSettings(BaseModel):
    flow_ai_enabled: bool = False
    ai_instructions: str = Field(default="", max_length=4000)
    ai_knowledge: str = Field(default="", max_length=20000)
    ai_unavailable_reply: str = Field(default="", max_length=1000)


class RoutingConfigResponse(AssistantSettings):
    fallback_action: Literal["none", "flow", "ai"]
    fallback_flow_id: UUID | None = None
    channel_connection_id: UUID | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RoutingConfigUpdate(AssistantSettings):
    fallback_action: Literal["none", "flow", "ai"]
    fallback_flow_id: UUID | None = None
    channel_connection_id: UUID | None = None
    expected_updated_at: datetime | None = None

    model_config = ConfigDict(extra="forbid")
