"""Isolated auth tests: SQLite only, no live database or external services."""
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "isolated-auth-test-secret-at-least-32-characters")

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_access_token, decode_token, hash_password
from app.models import Base, PasswordResetRequest, Role, SessionRefreshToken, Tenant, TenantMembership, User, UserSession
from app.services import session_service as service


class SessionRefreshTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[
            model.__table__ for model in (User, Tenant, Role, TenantMembership, UserSession, SessionRefreshToken, PasswordResetRequest)
        ])
        self.db = Session(self.engine, expire_on_commit=False)
        self.user = User(email="owner@example.com", password_hash="not-a-real-password", first_name="Owner")
        self.tenant = Tenant(name="Workspace", slug="workspace")
        self.role = Role(name="OWNER")
        self.db.add_all([self.user, self.tenant, self.role])
        self.db.flush()
        self.membership = TenantMembership(user_id=self.user.id, tenant_id=self.tenant.id, role_id=self.role.id)
        self.session = UserSession(user_id=self.user.id)
        self.db.add_all([self.membership, self.session])
        self.tokens = service.issue_session_tokens(self.db, self.session, self.tenant.id)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_access_is_short_lived_and_bound_to_user_tenant_and_session(self):
        claims = decode_token(self.tokens["access_token"])
        self.assertEqual(claims["sub"], str(self.user.id))
        self.assertEqual(claims["tenant_id"], str(self.tenant.id))
        self.assertEqual(claims["session_id"], str(self.session.id))
        self.assertLessEqual(claims["exp"] - claims["iat"], 15 * 60)
        self.assertNotIn("is_platform_admin", claims)
        stored = self.db.scalars(select(SessionRefreshToken)).one()
        self.assertNotEqual(stored.token_hash, self.tokens["refresh_token"])

    def test_rotation_and_concurrent_duplicate_return_same_successor(self):
        old = self.tokens["refresh_token"]
        first = service.refresh_session(self.db, old)
        duplicate = service.refresh_session(self.db, old)
        self.assertNotEqual(first["refresh_token"], old)
        self.assertEqual(first["refresh_token"], duplicate["refresh_token"])
        self.assertEqual(first["refresh_expires_at"], duplicate["refresh_expires_at"])
        second = service.refresh_session(self.db, first["refresh_token"])
        delayed = service.refresh_session(self.db, old)
        self.assertEqual(second["refresh_token"], delayed["refresh_token"])

    def test_replay_after_grace_revokes_entire_session(self):
        old = self.tokens["refresh_token"]
        current = service.refresh_session(self.db, old)
        with patch.object(service, "_now", return_value=datetime.now(timezone.utc) + timedelta(seconds=11)):
            with self.assertRaises(service.InvalidRefreshTokenError):
                service.refresh_session(self.db, old)
        self.assertFalse(self.session.is_active)
        with self.assertRaises(service.InvalidRefreshTokenError):
            service.refresh_session(self.db, current["refresh_token"])

    def test_invalid_token_cannot_revoke_someone_elses_session(self):
        service.revoke_refresh_session(self.db, "x" * 64)
        with self.assertRaises(service.InvalidRefreshTokenError):
            service.refresh_session(self.db, "x" * 64)
        self.assertTrue(self.session.is_active)

    def test_logout_can_revoke_with_consumed_refresh_after_access_expiry(self):
        current = service.refresh_session(self.db, self.tokens["refresh_token"])
        service.revoke_refresh_session(self.db, self.tokens["refresh_token"])
        with self.assertRaises(service.InvalidRefreshTokenError):
            service.refresh_session(self.db, current["refresh_token"])

    def test_refresh_does_not_extend_absolute_or_idle_limits(self):
        activity = self.session.last_active_at
        first = service.refresh_session(self.db, self.tokens["refresh_token"])
        self.assertEqual(self.session.last_active_at.replace(tzinfo=timezone.utc), activity.replace(tzinfo=timezone.utc))
        self.assertEqual(first["refresh_expires_at"], self.tokens["refresh_expires_at"])
        with patch.object(service, "_now", return_value=datetime.now(timezone.utc) + timedelta(days=8)):
            with self.assertRaises(service.InvalidRefreshTokenError):
                service.refresh_session(self.db, first["refresh_token"])

    def test_absolute_expiry_even_when_recently_active(self):
        later = datetime.now(timezone.utc) + timedelta(days=31)
        self.session.last_active_at = later
        self.db.commit()
        with patch.object(service, "_now", return_value=later):
            with self.assertRaises(service.InvalidRefreshTokenError):
                service.refresh_session(self.db, self.tokens["refresh_token"])

    def test_disabled_user_workspace_role_membership_and_revocation_reject_refresh(self):
        for target, attr, value in [
            (self.user, "is_active", False), (self.tenant, "is_active", False),
            (self.tenant, "is_deleted", True), (self.role, "is_active", False),
            (self.membership, "status", "inactive"), (self.session, "is_active", False),
        ]:
            with self.subTest(target=type(target).__name__, attribute=attr):
                previous = getattr(target, attr)
                setattr(target, attr, value)
                self.db.commit()
                with self.assertRaises(service.InvalidRefreshTokenError):
                    service.refresh_session(self.db, self.tokens["refresh_token"])
                setattr(target, attr, previous)
                self.session.is_active = True
                self.db.commit()

    def test_login_refresh_and_logout_http_contract(self):
        from app.api.auth import router
        from app.core.database import get_db
        self.user.password_hash = hash_password("Synthetic-password!")
        self.db.commit()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        with TestClient(app) as client:
            login = client.post("/auth/login", json={"email": self.user.email, "password": "Synthetic-password!"})
            self.assertEqual(login.status_code, 200, login.text)
            self.assertEqual(login.headers["Cache-Control"], "no-store")
            tokens = login.json()
            claims = decode_token(tokens["access_token"])
            expired = create_access_token(str(self.user.id), expires_minutes=-1, extra_claims={
                "tenant_id": str(self.tenant.id), "session_id": claims["session_id"],
            })
            self.assertEqual(client.get("/auth/platform-admin/status", headers={"Authorization": f"Bearer {expired}"}).status_code, 401)
            renewed = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
            self.assertEqual(renewed.status_code, 200, renewed.text)
            current = renewed.json()
            self.assertNotEqual(current["refresh_token"], tokens["refresh_token"])
            headers = {"Authorization": f"Bearer {current['access_token']}"}
            self.assertEqual(client.get("/auth/platform-admin/status", headers=headers).status_code, 200)
            self.assertEqual(client.post("/auth/revoke", json={"refresh_token": current["refresh_token"]}).status_code, 204)
            self.assertEqual(client.post("/auth/refresh", json={"refresh_token": current["refresh_token"]}).status_code, 401)
            self.assertEqual(client.get("/auth/platform-admin/status", headers=headers).status_code, 401)
            signed_in = client.post("/auth/login", json={"email": self.user.email, "password": "Synthetic-password!"}).json()
            self.assertEqual(client.post("/auth/logout", headers={"Authorization": f"Bearer {signed_in['access_token']}"}).status_code, 204)
            self.assertEqual(client.post("/auth/refresh", json={"refresh_token": signed_in["refresh_token"]}).status_code, 401)

    def test_password_reset_revokes_access_and_refresh_for_existing_sessions(self):
        from app.schemas.auth import PasswordResetCompleteRequest
        from app.services.auth_service import complete_password_reset
        import hashlib
        raw = "synthetic-reset-token-at-least-32-characters"
        self.db.add(PasswordResetRequest(
            user_id=self.user.id, email=self.user.email, status="approved",
            reset_token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        self.db.commit()
        complete_password_reset(self.db, PasswordResetCompleteRequest(token=raw, password="Synthetic-New-Password!"))
        with self.assertRaises(service.InvalidRefreshTokenError):
            service.refresh_session(self.db, self.tokens["refresh_token"])


if __name__ == "__main__":
    unittest.main()
