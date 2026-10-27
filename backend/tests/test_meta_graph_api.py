"""
Comprehensive tests for Meta Graph API integration:
- System User permanent tokens vs expiring/temporary tokens
- Differentiated error handling (expired, revoked, invalid, unassigned assets, insufficient permissions)
- Graph API URL and version configuration (v26.0)
- Missing Graph API configuration
- Incorrect IDs and unassigned assets
- Multi-tenant credential isolation
"""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from cryptography.fernet import Fernet

from app.core.config import settings
from app.integrations.base import (
    ProviderCredentials,
    ProviderNotConfiguredError,
    ProviderVerificationError,
)
from app.integrations.meta.graph_client import (
    MetaGraphClient,
    MetaGraphConfigurationError,
    MetaGraphError,
    appsecret_proof,
    build_graph_client,
    is_meta_configured,
)
from app.integrations.registry import get_provider
from app.models import ChannelConnection, ChannelStatus, ChannelType
from app.services.credential_service import get_credential_service
from app.services.whatsapp_service import (
    WhatsAppNotConfiguredError,
    WhatsAppVerificationFailedError,
    check_whatsapp_channel,
    connect_whatsapp_channel,
)
from app.schemas.whatsapp import WhatsAppConnectRequest
from pydantic import SecretStr
from tests.base import DatabaseTestCase

TEST_APP_ID = "999888777666"
TEST_APP_SECRET = f"secret-{uuid.uuid4().hex}"
TEST_WABA = "987654321012345"
TEST_PHONE = "987654321054321"
WRONG_PHONE = "1999999999999999"

SYSTEM_USER_TOKEN = f"EAAG-system-user-{uuid.uuid4().hex}"
EXPIRED_TOKEN = f"EAAG-expired-{uuid.uuid4().hex}"
REVOKED_TOKEN = f"EAAG-revoked-{uuid.uuid4().hex}"
INVALID_SIG_TOKEN = f"EAAG-invalidsig-{uuid.uuid4().hex}"
UNASSIGNED_ASSET_TOKEN = f"EAAG-noasset-{uuid.uuid4().hex}"
MISSING_SCOPE_TOKEN = f"EAAG-missingscope-{uuid.uuid4().hex}"


def _make_graph_mock():
    def handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        path = request.url.path.lstrip("/")
        _, _, endpoint = path.partition("/")
        params = request.url.params
        auth = request.headers.get("authorization", "")
        token = auth[len("Bearer "):] if auth.startswith("Bearer ") else None

        if endpoint == "debug_token":
            input_token = params.get("input_token")
            if input_token == SYSTEM_USER_TOKEN:
                return httpx.Response(
                    200,
                    json={
                        "data": {
                            "is_valid": True,
                            "app_id": TEST_APP_ID,
                            "type": "SYSTEM_USER",
                            "expires_at": 0,
                            "scopes": [
                                "business_management",
                                "whatsapp_business_management",
                                "whatsapp_business_messaging",
                            ],
                            "granular_scopes": [
                                {"scope": "whatsapp_business_management", "target_ids": [TEST_WABA]},
                                {"scope": "whatsapp_business_messaging", "target_ids": [TEST_WABA]},
                            ],
                        }
                    },
                )
            elif input_token == EXPIRED_TOKEN:
                return httpx.Response(
                    200,
                    json={
                        "data": {
                            "is_valid": False,
                            "app_id": TEST_APP_ID,
                            "error": {
                                "code": 190,
                                "subcode": 463,
                                "message": "Error validating access token: Session has expired.",
                            },
                        }
                    },
                )
            elif input_token == REVOKED_TOKEN:
                return httpx.Response(
                    200,
                    json={
                        "data": {
                            "is_valid": False,
                            "app_id": TEST_APP_ID,
                            "error": {
                                "code": 190,
                                "subcode": 467,
                                "message": "Error validating access token: Token was revoked.",
                            },
                        }
                    },
                )
            elif input_token == MISSING_SCOPE_TOKEN:
                return httpx.Response(
                    200,
                    json={
                        "data": {
                            "is_valid": True,
                            "app_id": TEST_APP_ID,
                            "type": "SYSTEM_USER",
                            "expires_at": 0,
                            "scopes": ["business_management"],
                            "granular_scopes": [],
                        }
                    },
                )
            elif input_token == UNASSIGNED_ASSET_TOKEN:
                return httpx.Response(
                    200,
                    json={
                        "data": {
                            "is_valid": True,
                            "app_id": TEST_APP_ID,
                            "type": "SYSTEM_USER",
                            "expires_at": 0,
                            "scopes": [
                                "whatsapp_business_management",
                                "whatsapp_business_messaging",
                            ],
                            "granular_scopes": [],
                        }
                    },
                )
            return httpx.Response(
                200,
                json={"data": {"is_valid": False, "app_id": TEST_APP_ID}},
            )

        if token == UNASSIGNED_ASSET_TOKEN and TEST_WABA in path:
            return httpx.Response(
                400,
                json={
                    "error": {
                        "message": f"Unsupported get request. Object with ID '{TEST_WABA}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.",
                        "type": "GraphMethodException",
                        "code": 100,
                        "error_subcode": 33,
                    }
                },
            )

        if endpoint == TEST_WABA:
            return httpx.Response(200, json={"id": TEST_WABA, "name": "Omniflow Business"})

        if endpoint == f"{TEST_WABA}/phone_numbers":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": TEST_PHONE,
                            "display_phone_number": "+91 82379 96380",
                            "verified_name": "Omniflow",
                            "quality_rating": "GREEN",
                        }
                    ]
                },
            )

        if endpoint == f"{TEST_WABA}/subscribed_apps":
            if request.method == "POST":
                return httpx.Response(200, json={"success": True})
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "whatsapp_business_api_data": {
                                "id": TEST_APP_ID,
                                "name": "Omniflow communication",
                            }
                        }
                    ]
                },
            )

        if endpoint == TEST_PHONE:
            return httpx.Response(
                200,
                json={
                    "id": TEST_PHONE,
                    "display_phone_number": "+91 82379 96380",
                    "verified_name": "Omniflow",
                    "quality_rating": "GREEN",
                },
            )

        return httpx.Response(404, json={"error": {"message": "Not found", "code": 803}})

    return handler


class MetaGraphApiTestCase(DatabaseTestCase):

    @classmethod
    def setUpClass(cls) -> None:
        cls._saved = {
            "meta_app_id": settings.meta_app_id,
            "meta_app_secret": settings.meta_app_secret,
            "meta_graph_api_base_url": settings.meta_graph_api_base_url,
            "meta_graph_api_version": settings.meta_graph_api_version,
            "channel_credential_keys": settings.channel_credential_keys,
        }
        settings.meta_app_id = TEST_APP_ID
        settings.meta_app_secret = TEST_APP_SECRET
        settings.meta_graph_api_base_url = "https://graph.facebook.com"
        settings.meta_graph_api_version = "v26.0"
        settings.channel_credential_keys = Fernet.generate_key().decode()

        cls.provider = get_provider(ChannelType.WHATSAPP)
        super().setUpClass()

    @classmethod
    def tearDownClass(cls) -> None:
        super().tearDownClass()
        for k, v in cls._saved.items():
            setattr(settings, k, v)
        cls.provider.client_factory = build_graph_client

    def setUp(self) -> None:
        super().setUp()
        self.mock_handler = _make_graph_mock()
        self.transport = httpx.MockTransport(self.mock_handler)
        self.provider.client_factory = lambda: build_graph_client(transport=self.transport)

    def reload(self, obj):
        self.db.expire(obj)
        return self.db.get(type(obj), obj.id)

    @classmethod
    def create_fixtures(cls) -> None:
        cls.tenant_1 = cls.make_tenant("Tenant 1")
        cls.owner_1 = cls.make_member(cls.tenant_1, "OWNER")
        cls.channel_1 = cls.make_channel(cls.tenant_1, ChannelType.WHATSAPP, "Channel 1")

        cls.tenant_2 = cls.make_tenant("Tenant 2")
        cls.owner_2 = cls.make_member(cls.tenant_2, "OWNER")
        cls.channel_2 = cls.make_channel(cls.tenant_2, ChannelType.WHATSAPP, "Channel 2")

    @classmethod
    def make_channel(cls, tenant, channel_type, name):
        channel = ChannelConnection(
            tenant_id=tenant.id,
            channel_type=channel_type,
            name=name,
            status=ChannelStatus.DISCONNECTED,
            is_active=True,
        )
        cls.db.add(channel)
        cls.db.commit()
        return channel

    def test_01_version_normalization(self):
        """Graph API version normalization accepts v21.0, 21.0."""
        from app.core.config import Settings
        s1 = Settings(meta_graph_api_version="21.0")
        self.assertEqual(s1.meta_graph_api_version, "v21.0")

        s2 = Settings(meta_graph_api_version="v21.0")
        self.assertEqual(s2.meta_graph_api_version, "v21.0")

        s3 = Settings(meta_graph_api_version="")
        self.assertEqual(s3.meta_graph_api_version, "v21.0")

    def test_02_system_user_token_never_expires(self):
        """Permanent System User tokens have expires_at=0, stored with token_expires_at=None."""
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(SYSTEM_USER_TOKEN),
        )
        res = connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        self.assertEqual(res.status, "connected")
        self.assertIsNone(res.token_expires_at)

        chan = self.reload(self.channel_1)
        self.assertIsNone(chan.token_expires_at)
        self.assertEqual(chan.status, ChannelStatus.CONNECTED)

        # Health check succeeds
        check = check_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id)
        self.assertTrue(check.healthy)
        self.assertEqual(check.detail, "WhatsApp connection is healthy.")
        self.assertTrue(check.webhook_subscribed)

    def test_03_expired_token_subcode_463(self):
        """Expired tokens with error subcode 463 produce actionable diagnosis."""
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(EXPIRED_TOKEN),
        )
        with self.assertRaises(WhatsAppVerificationFailedError) as ctx:
            connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        self.assertIn("expired", str(ctx.exception).lower())
        self.assertIn("190/463", str(ctx.exception))

    def test_04_revoked_token_subcode_467(self):
        """Revoked tokens with error subcode 467 report token revocation."""
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(REVOKED_TOKEN),
        )
        with self.assertRaises(WhatsAppVerificationFailedError) as ctx:
            connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        self.assertIn("revoked", str(ctx.exception).lower())

    def test_05_missing_required_permissions(self):
        """Tokens missing whatsapp_business_messaging or management report missing permissions."""
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(MISSING_SCOPE_TOKEN),
        )
        with self.assertRaises(WhatsAppVerificationFailedError) as ctx:
            connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        self.assertIn("missing required permissions", str(ctx.exception).lower())

    def test_06_unassigned_waba_asset_error(self):
        """System User token with unassigned WABA produces clear asset assignment diagnosis."""
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(UNASSIGNED_ASSET_TOKEN),
        )
        with self.assertRaises(WhatsAppVerificationFailedError) as ctx:
            connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        err = str(ctx.exception)
        self.assertIn("asset access denied", err.lower())
        self.assertIn("assign assets", err.lower())

    def test_07_invalid_ids(self):
        """Non-numeric IDs and unlisted phone numbers are rejected."""
        import pydantic
        with self.assertRaises(pydantic.ValidationError):
            WhatsAppConnectRequest(
                phone_number_id="+15550100",
                waba_id=TEST_WABA,
                access_token=SecretStr(SYSTEM_USER_TOKEN),
            )

        req_wrong_phone = WhatsAppConnectRequest(
            phone_number_id="888888888888888",
            waba_id=TEST_WABA,
            access_token=SecretStr(SYSTEM_USER_TOKEN),
        )
        with self.assertRaises(WhatsAppVerificationFailedError) as ctx:
            connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req_wrong_phone)
        self.assertIn("does not belong", str(ctx.exception).lower())

    def test_08_missing_graph_api_configuration(self):
        """Missing Meta App ID or Secret raises WhatsAppNotConfiguredError."""
        saved_app_id = settings.meta_app_id
        try:
            settings.meta_app_id = ""
            self.assertFalse(self.provider.is_configured())

            req = WhatsAppConnectRequest(
                phone_number_id=TEST_PHONE,
                waba_id=TEST_WABA,
                access_token=SecretStr(SYSTEM_USER_TOKEN),
            )
            with self.assertRaises(WhatsAppNotConfiguredError):
                connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)
        finally:
            settings.meta_app_id = saved_app_id

    def test_09_multi_tenant_isolation(self):
        """Tenant 2 cannot connect, view, or check Tenant 1's channel."""
        from app.services.channel_service import ChannelNotFoundError

        # Connect Tenant 1's channel
        req = WhatsAppConnectRequest(
            phone_number_id=TEST_PHONE,
            waba_id=TEST_WABA,
            access_token=SecretStr(SYSTEM_USER_TOKEN),
        )
        connect_whatsapp_channel(self.db, self.tenant_1.id, self.channel_1.id, req)

        # Tenant 2 attempts to run health check on Tenant 1's channel
        with self.assertRaises(ChannelNotFoundError):
            check_whatsapp_channel(self.db, self.tenant_2.id, self.channel_1.id)

        # Tenant 2 attempts to connect Tenant 1's channel
        with self.assertRaises(ChannelNotFoundError):
            connect_whatsapp_channel(self.db, self.tenant_2.id, self.channel_1.id, req)

        # Stored credentials are encrypted and scoped to tenant 1
        chan = self.reload(self.channel_1)
        self.assertIsNotNone(chan.access_token_encrypted)
        decrypted = get_credential_service().decrypt(chan.access_token_encrypted)
        self.assertEqual(decrypted, SYSTEM_USER_TOKEN)
