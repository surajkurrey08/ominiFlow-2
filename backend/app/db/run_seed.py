from app.core.database import SessionLocal
from app.db.seed import (
    seed_permissions,
    seed_role_permissions,
    seed_system_roles,
)
from app.db.seed_platform_templates import seed_default_platform_templates


def main() -> None:
    db = SessionLocal()

    try:
        seed_system_roles(db)
        print("System roles seeded successfully.")

        seed_permissions(db)
        print("Permissions seeded successfully.")

        seed_role_permissions(db)
        print("Role permissions seeded successfully.")

        seeded_templates = seed_default_platform_templates(db)
        print(f"Default platform templates seeded successfully: {seeded_templates} created.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

