import logging
import uuid
from sqlalchemy.orm import Session

from app.models.platform_template import PlatformTemplate
from app.models.user import User

logger = logging.getLogger(__name__)

DEFAULT_PLATFORM_TEMPLATES = [
    # Orders Category
    {
        "name": "order_confirmation_v1",
        "label": "Order Confirmation",
        "category": "orders",
        "language": "en_US",
        "body_text": "Hello {{1}}, thank you for your order #{{2}}! We have received your order of {{3}} and are preparing it now. You will receive an update once it ships.",
    },
    {
        "name": "order_shipping_update_v1",
        "label": "Order Shipping Update",
        "category": "orders",
        "language": "en_US",
        "body_text": "Hi {{1}}, great news! Your order #{{2}} has been shipped via {{3}}. Your tracking number is {{4}}. Expected delivery: {{5}}.",
    },
    {
        "name": "order_delivered_v1",
        "label": "Order Delivered",
        "category": "orders",
        "language": "en_US",
        "body_text": "Hi {{1}}, your package for order #{{2}} was delivered today at {{3}}. Thank you for choosing us! Reply SUPPORT if you need any assistance.",
    },

    # Payments Category
    {
        "name": "payment_reminder_v1",
        "label": "Payment Reminder",
        "category": "payments",
        "language": "en_US",
        "body_text": "Hello {{1}}, this is a friendly reminder that payment of {{2}} for invoice #{{3}} is due on {{4}}. Please let us know once completed. Thank you!",
    },
    {
        "name": "payment_receipt_v1",
        "label": "Payment Receipt",
        "category": "payments",
        "language": "en_US",
        "body_text": "Dear {{1}}, we have received your payment of {{2}} for invoice #{{3}}. Transaction reference: {{4}}. Thank you for your business!",
    },

    # Appointments Category
    {
        "name": "appointment_booking_v1",
        "label": "Appointment Confirmation",
        "category": "appointments",
        "language": "en_US",
        "body_text": "Hello {{1}}, your appointment with {{2}} is confirmed for {{3}} at {{4}}. Location: {{5}}. Please arrive 10 minutes prior.",
    },
    {
        "name": "appointment_reminder_v1",
        "label": "Appointment Reminder",
        "category": "appointments",
        "language": "en_US",
        "body_text": "Hi {{1}}, this is a reminder for your upcoming appointment tomorrow, {{2}} at {{3}} with {{4}}. Reply 1 to CONFIRM or 2 to RESCHEDULE.",
    },

    # Welcome Category
    {
        "name": "welcome_greeting_v1",
        "label": "Welcome Greeting",
        "category": "welcome",
        "language": "en_US",
        "body_text": "Welcome to {{1}}, {{2}}! We are delighted to have you on board. Explore our latest products and services anytime by replying to this chat.",
    },
    {
        "name": "new_subscriber_welcome_v1",
        "label": "New Member Welcome",
        "category": "welcome",
        "language": "en_US",
        "body_text": "Hi {{1}}, welcome to the {{2}} VIP community! As a member, you get access to exclusive offers, priority support, and early product drops.",
    },

    # Support Category
    {
        "name": "support_ticket_created_v1",
        "label": "Support Ticket Created",
        "category": "support",
        "language": "en_US",
        "body_text": "Hello {{1}}, we have received your support request. Ticket #{{2}} has been created: '{{3}}'. An agent will review and reply within {{4}} hours.",
    },
    {
        "name": "support_ticket_resolved_v1",
        "label": "Support Ticket Resolved",
        "category": "support",
        "language": "en_US",
        "body_text": "Hi {{1}}, your support ticket #{{2}} has been marked as resolved. If you still need help, simply reply to this message anytime.",
    },

    # Marketing Category
    {
        "name": "special_promotional_offer_v1",
        "label": "Special Promotional Offer",
        "category": "marketing",
        "language": "en_US",
        "body_text": "Hi {{1}}! Exclusive limited-time offer for you: enjoy {{2}}% OFF on your favorite items using code {{3}}. Valid until {{4}} only!",
    },
    {
        "name": "festive_sale_discount_v1",
        "label": "Festive Sale Discount",
        "category": "marketing",
        "language": "en_US",
        "body_text": "Celebrate this festive season with {{1}}! Get up to {{2}}% OFF on all collections with promo code {{3}}. Shop today before stocks run out!",
    },
]


def seed_default_platform_templates(db: Session, super_admin_user_id: uuid.UUID | None = None) -> int:
    """Seed default reusable platform templates into the shared library."""
    user_id = super_admin_user_id
    if user_id is None:
        admin_user = (
            db.query(User)
            .filter(User.is_platform_super_admin.is_(True))
            .first()
        )
        if admin_user is None:
            admin_user = db.query(User).first()
        if admin_user is None:
            logger.warning("No user found in database to associate with seeded platform templates.")
            return 0
        user_id = admin_user.id

    created_count = 0
    for item in DEFAULT_PLATFORM_TEMPLATES:
        existing = (
            db.query(PlatformTemplate)
            .filter(
                PlatformTemplate.name == item["name"],
                PlatformTemplate.language == item["language"],
            )
            .first()
        )
        if existing is None:
            new_template = PlatformTemplate(
                name=item["name"],
                label=item["label"],
                category=item["category"],
                language=item["language"],
                body_text=item["body_text"],
                is_active=True,
                created_by=user_id,
            )
            db.add(new_template)
            created_count += 1
        else:
            existing.label = item["label"]
            existing.category = item["category"]
            existing.body_text = item["body_text"]
            existing.is_active = True

    try:
        db.commit()
        if created_count > 0:
            logger.info("Successfully seeded %d platform templates.", created_count)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to seed platform templates: %s", exc)
        raise

    return created_count
