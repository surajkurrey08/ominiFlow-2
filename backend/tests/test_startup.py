"""Startup hooks must not crash a fresh install or create a public production admin."""
import unittest
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.main import app, ensure_default_platform_super_admin, ensure_default_platform_templates


class PlatformAdminStartupTests(unittest.TestCase):
    def setUp(self):
        self.session = MagicMock()
        self.factory = MagicMock()
        self.factory.return_value.__enter__.return_value = self.session

    def test_production_does_not_create_or_modify_default_account(self):
        for environment in ("production", "prod"):
            with self.subTest(environment=environment), patch.object(settings, "app_env", environment), patch("app.core.database.SessionLocal", self.factory), patch("app.core.security.hash_password") as hasher:
                ensure_default_platform_super_admin()
                self.factory.assert_not_called()
                hasher.assert_not_called()

    def test_fresh_development_account_logs_without_crashing(self):
        self.session.query.return_value.filter.return_value.first.return_value = None
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), patch("app.core.security.hash_password", return_value="test-hash"), self.assertLogs("app.main", level="INFO"):
            ensure_default_platform_super_admin()
        self.session.commit.assert_called_once()
        created = self.session.add.call_args.args[0]
        self.assertTrue(created.is_platform_super_admin)
        self.assertEqual(created.password_hash, "test-hash")

    def test_development_database_failure_is_logged_without_crashing(self):
        self.factory.return_value.__enter__.side_effect = RuntimeError("Database unavailable")
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), self.assertLogs("app.main", level="WARNING"):
            ensure_default_platform_super_admin()
        self.session.commit.assert_not_called()

    def test_existing_development_admin_is_not_rewritten(self):
        existing = MagicMock(is_platform_super_admin=True, is_active=True)
        self.session.query.return_value.filter.return_value.first.return_value = existing
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), patch("app.core.security.hash_password") as hasher:
            ensure_default_platform_super_admin()
        self.session.commit.assert_not_called()
        hasher.assert_not_called()


class PlatformTemplateStartupTests(unittest.TestCase):
    def setUp(self):
        self.session = MagicMock()
        self.factory = MagicMock()
        self.factory.return_value.__enter__.return_value = self.session

    def test_template_seed_runs_after_admin_setup(self):
        handlers = app.router.on_startup
        self.assertLess(
            handlers.index(ensure_default_platform_super_admin),
            handlers.index(ensure_default_platform_templates),
        )

    def test_production_does_not_seed_templates(self):
        for environment in ("production", "prod"):
            with self.subTest(environment=environment), patch.object(settings, "app_env", environment), patch("app.core.database.SessionLocal", self.factory), patch("app.db.seed_platform_templates.seed_default_platform_templates") as seed:
                ensure_default_platform_templates()
                self.factory.assert_not_called()
                seed.assert_not_called()

    def test_development_seeds_templates_in_its_own_session(self):
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), patch("app.db.seed_platform_templates.seed_default_platform_templates") as seed:
            ensure_default_platform_templates()
        self.factory.assert_called_once_with()
        seed.assert_called_once_with(self.session)
        self.factory.return_value.__exit__.assert_called_once()

    def test_development_seed_failure_is_logged_without_crashing(self):
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), patch("app.db.seed_platform_templates.seed_default_platform_templates", side_effect=RuntimeError("Seed unavailable")), self.assertLogs("app.main", level="WARNING") as logs:
            ensure_default_platform_templates()
        self.assertIn("Could not auto-seed platform templates", logs.output[0])
        self.factory.return_value.__exit__.assert_called_once()

    def test_development_database_failure_is_logged_without_crashing(self):
        self.factory.return_value.__enter__.side_effect = RuntimeError("Database unavailable")
        with patch.object(settings, "app_env", "development"), patch("app.core.database.SessionLocal", self.factory), patch("app.db.seed_platform_templates.seed_default_platform_templates") as seed, self.assertLogs("app.main", level="WARNING"):
            ensure_default_platform_templates()
        seed.assert_not_called()


if __name__ == "__main__":
    unittest.main()
