from sqlalchemy.orm import Session
from app.models.whatsapp_form import WhatsAppForm, WhatsAppFormSubmission
from app.schemas.whatsapp_form import WhatsAppFormCreate, WhatsAppFormUpdate, WhatsAppFormSubmissionCreate

def list_forms(db: Session, tenant_id: str, page: int = 1, size: int = 20):
    query = db.query(WhatsAppForm).filter(WhatsAppForm.tenant_id == tenant_id)
    total = query.count()
    items = query.order_by(WhatsAppForm.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": items, "total": total, "page": page, "size": size}

def get_form(db: Session, tenant_id: str, form_id: str):
    return db.query(WhatsAppForm).filter(WhatsAppForm.tenant_id == tenant_id, WhatsAppForm.id == form_id).first()

def get_public_form(db: Session, form_id: str):
    return db.query(WhatsAppForm).filter(WhatsAppForm.id == form_id).first()

def create_form(db: Session, tenant_id: str, data: WhatsAppFormCreate):
    form = WhatsAppForm(tenant_id=tenant_id, **data.model_dump())
    db.add(form)
    db.commit()
    db.refresh(form)
    return form

def update_form(db: Session, tenant_id: str, form_id: str, data: WhatsAppFormUpdate):
    form = get_form(db, tenant_id, form_id)
    if not form:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(form, k, v)
    db.commit()
    db.refresh(form)
    return form

def delete_form(db: Session, tenant_id: str, form_id: str):
    form = get_form(db, tenant_id, form_id)
    if form:
        db.delete(form)
        db.commit()
        return True
    return False

def submit_form(db: Session, form_id: str, data: WhatsAppFormSubmissionCreate):
    form = get_public_form(db, form_id)
    if not form:
        return None
    sub = WhatsAppFormSubmission(
        tenant_id=form.tenant_id,
        form_id=form.id,
        contact_phone=data.contact_phone,
        contact_name=data.contact_name,
        data=data.data,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub

def list_submissions(db: Session, tenant_id: str, form_id: str):
    return db.query(WhatsAppFormSubmission).filter(
        WhatsAppFormSubmission.tenant_id == tenant_id,
        WhatsAppFormSubmission.form_id == form_id,
    ).order_by(WhatsAppFormSubmission.created_at.desc()).all()

