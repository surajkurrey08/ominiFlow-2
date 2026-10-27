import uuid
from datetime import datetime
from pydantic import BaseModel, Field

class WhatsAppFormBase(BaseModel):
    name: str = Field(..., max_length=255)
    category: str | None = None

class WhatsAppFormCreate(WhatsAppFormBase):
    config: dict | None = None

class WhatsAppFormUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    category: str | None = None
    status: str | None = None
    config: dict | None = None

class WhatsAppFormResponse(WhatsAppFormBase):
    id: uuid.UUID | str
    status: str
    config: dict | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class WhatsAppFormListResponse(BaseModel):
    items: list[WhatsAppFormResponse]
    total: int
    page: int
    size: int

class WhatsAppFormPublicResponse(BaseModel):
    id: uuid.UUID | str
    name: str
    category: str | None = None
    status: str
    config: dict | None = None

    class Config:
        from_attributes = True

class WhatsAppFormSubmissionCreate(BaseModel):
    contact_phone: str | None = None
    contact_name: str | None = None
    data: dict

class WhatsAppFormSubmissionResponse(BaseModel):
    id: uuid.UUID | str
    tenant_id: uuid.UUID | str
    form_id: uuid.UUID | str
    contact_phone: str | None = None
    contact_name: str | None = None
    data: dict
    created_at: datetime

    class Config:
        from_attributes = True

