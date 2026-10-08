from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import mail, signing
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import AuthBucket, EmailChallenge, LoginSession, RecoveryEmail


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SecurityTests(APITestCase):
    old = "Strong-old-password-570!"
    new = "Stronger-new-password-921!"

    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="legacy@example.com", password=self.old)
        self.other = User.objects.create_user(username="other", email="legacy@example.com", password=self.old)

    def login(self, user=None):
        user = user or self.user
        response = self.client.post("/api/token/", {"username": user.username, "password": self.old})
        self.assertEqual(response.status_code, 200)
        return response.data

    def authenticate(self, tokens):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])

    def link(self):
        return {key: value[0] for key, value in parse_qs(urlsplit(mail.outbox[-1].body.splitlines()[3]).fragment).items()}

    def verify(self, user=None, email="recovery@example.com"):
        user = user or self.user
        self.authenticate(self.login(user))
        response = self.client.post("/api/email/verify/request/", {"email": email, "password": self.old})
        self.assertEqual(response.status_code, 200)
        link = self.link()
        self.client.credentials()
        self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": link["token"]}).status_code, 200)
        return link

    def test_logout_revokes_access_and_refresh_but_not_other_sessions(self):
        first, second, other = self.login(), self.login(), self.login(self.other)
        self.authenticate(first)
        self.assertEqual(self.client.post("/api/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": first["refresh"]}).status_code, 401)
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": second["refresh"]}).status_code, 200)
        self.authenticate(other)
        self.assertEqual(self.client.get("/api/me/").status_code, 200)

    def test_tokens_without_valid_session_are_rejected(self):
        refresh = RefreshToken.for_user(self.user)
        for sid in (None, "invalid", "00000000-0000-0000-0000-000000000000"):
            refresh["sid"] = sid
            self.authenticate({"access": str(refresh.access_token)})
            self.assertEqual(self.client.get("/api/me/").status_code, 401)
            self.client.credentials()
            self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": str(refresh)}).status_code, 401)
        tokens = self.login()
        LoginSession.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.authenticate(tokens)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)

    def test_password_change_checks_current_and_new_passwords_and_ends_all_sessions(self):
        first, second = self.login(), self.login()
        self.authenticate(first)
        payload = {"current_password": "wrong", "new_password": self.new, "confirm_password": self.new}
        self.assertEqual(self.client.post("/api/password/change/", payload).status_code, 400)
        payload["current_password"] = self.old
        payload["confirm_password"] = "different"
        self.assertEqual(self.client.post("/api/password/change/", payload).status_code, 400)
        payload["new_password"] = payload["confirm_password"] = "123"
        self.assertEqual(self.client.post("/api/password/change/", payload).status_code, 400)
        payload["new_password"] = payload["confirm_password"] = self.new
        self.assertEqual(self.client.post("/api/password/change/", payload).status_code, 204)
        self.authenticate(second)
        self.assertEqual(self.client.get("/api/me/").status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": second["refresh"]}).status_code, 401)
        self.assertEqual(self.client.post("/api/token/", {"username": "owner", "password": self.old}).status_code, 401)
        self.assertEqual(self.client.post("/api/token/", {"username": "owner", "password": self.new}).status_code, 200)

    def test_overlong_password_is_rejected_before_authentication(self):
        response = self.client.post("/api/token/", {"username": "owner", "password": "x" * 257})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(LoginSession.objects.count(), 0)

    def test_legacy_addresses_are_not_recovery_addresses(self):
        tokens = self.login()
        self.authenticate(tokens)
        self.assertFalse(self.client.get("/api/me/").data["email_verified"])
        self.client.credentials()
        known = self.client.post("/api/password/reset/request/", {"email": "legacy@example.com"})
        unknown = self.client.post("/api/password/reset/request/", {"email": "unknown@example.com"})
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_verification_requires_password_and_is_single_use(self):
        self.authenticate(self.login())
        self.assertEqual(self.client.post("/api/email/verify/request/", {"email": "RECOVERY@example.com", "password": "wrong"}).status_code, 400)
        self.assertEqual(EmailChallenge.objects.count(), 0)
        link = self.verify(email="RECOVERY@example.com")
        self.assertEqual(RecoveryEmail.objects.get(user=self.user).email, "recovery@example.com")
        self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": link["token"]}).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "recovery@example.com")

    def test_new_verification_invalidates_previous_link_and_duplicate_claim_is_rejected(self):
        first = self.verify()
        self.authenticate(self.login(self.other))
        self.client.post("/api/email/verify/request/", {"email": "recovery@example.com", "password": self.old})
        duplicate = self.link()
        self.client.credentials()
        self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": duplicate["token"]}).status_code, 400)
        self.assertFalse(RecoveryEmail.objects.filter(user=self.other).exists())
        self.authenticate(self.login())
        self.client.post("/api/email/verify/request/", {"email": "new@example.com", "password": self.old})
        previous = self.link()
        self.client.post("/api/email/verify/request/", {"email": "next@example.com", "password": self.old})
        next_link = self.link()
        self.client.credentials()
        for link in (first, previous):
            self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": link["token"]}).status_code, 400)
        self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": next_link["token"]}).status_code, 200)

    def test_expired_or_tampered_verification_does_not_claim_address(self):
        self.authenticate(self.login())
        with patch("django.core.signing.time.time", return_value=1):
            self.client.post("/api/email/verify/request/", {"email": "recovery@example.com", "password": self.old})
        link = self.link()
        self.client.credentials()
        for token in (link["token"], link["token"] + "x", "garbage"):
            self.assertEqual(self.client.post("/api/email/verify/confirm/", {"token": token}).status_code, 400)
        self.assertEqual(RecoveryEmail.objects.count(), 0)

    def test_reset_is_single_use_and_invalidates_all_sessions(self):
        self.verify()
        first, second = self.login(), self.login()
        self.client.credentials()
        self.assertEqual(self.client.post("/api/password/reset/request/", {"email": "RECOVERY@example.com"}).status_code, 200)
        link = self.link()
        payload = {"uid": link["uid"], "token": link["token"], "new_password": self.new, "confirm_password": self.new}
        self.assertEqual(self.client.post("/api/password/reset/confirm/", payload).status_code, 200)
        self.assertEqual(self.client.post("/api/password/reset/confirm/", payload).status_code, 400)
        for tokens in (first, second):
            self.authenticate(tokens)
            self.assertEqual(self.client.get("/api/me/").status_code, 401)
            self.client.credentials()
            self.assertEqual(self.client.post("/api/token/refresh/", {"refresh": tokens["refresh"]}).status_code, 401)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new))

    def test_expired_reset_and_invalid_inputs_do_not_change_password(self):
        self.verify()
        with patch("django.contrib.auth.tokens.PasswordResetTokenGenerator._now") as now:
            from datetime import datetime
            now.return_value = datetime(2020, 1, 1)
            self.client.post("/api/password/reset/request/", {"email": "recovery@example.com"})
        link = self.link()
        for uid, token in ((link["uid"], link["token"]), ("invalid", "invalid")):
            self.assertEqual(self.client.post("/api/password/reset/confirm/", {"uid": uid, "token": token, "new_password": self.new, "confirm_password": self.new}).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.old))

    def test_provider_failure_does_not_disclose_address_existence_or_commit_verification(self):
        self.verify()
        with patch("accounts.security.send_mail", side_effect=OSError("private-provider-error")):
            known = self.client.post("/api/password/reset/request/", {"email": "recovery@example.com"})
            unknown = self.client.post("/api/password/reset/request/", {"email": "missing@example.com"})
            self.assertEqual(known.data, unknown.data)
            self.authenticate(self.login())
            self.assertEqual(self.client.post("/api/email/verify/request/", {"email": "new@example.com", "password": self.old}).status_code, 503)
            self.assertFalse(EmailChallenge.objects.filter(user=self.user).exists())

    @override_settings(AUTH_RATE_LIMITS={"login_ip": (2, 60), "login_account": (2, 60)})
    def test_login_rate_limit_is_persistent_and_cannot_be_bypassed_with_forwarded_header(self):
        for index in range(2):
            response = self.client.post("/api/token/", {"username": "owner", "password": "wrong"}, HTTP_X_FORWARDED_FOR=f"1.2.3.{index}")
            self.assertEqual(response.status_code, 401)
        response = self.client.post("/api/token/", {"username": "owner", "password": self.old}, HTTP_X_FORWARDED_FOR="4.3.2.1")
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)
        self.assertTrue(AuthBucket.objects.exists())
        AuthBucket.objects.update(starts_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self.client.post("/api/token/", {"username": "owner", "password": self.old}).status_code, 200)


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.utils import get_md5_hash_password


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row locking")
class ConcurrentRecoveryTests(TransactionTestCase):
    def simultaneous(self, endpoint, payloads):
        barrier = Barrier(len(payloads))
        def submit(payload):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return APIClient().post(endpoint, payload, format="json").status_code
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=len(payloads)) as pool:
            return list(pool.map(submit, payloads))

    def test_only_one_simultaneous_password_reset_succeeds(self):
        user = User.objects.create_user(username="owner", password="Original-password-912!")
        RecoveryEmail.objects.create(user=user, email="owner@example.com")
        payload = {"uid": urlsafe_base64_encode(force_bytes(user.pk)), "token": default_token_generator.make_token(user),
                   "new_password": "Different-password-431!", "confirm_password": "Different-password-431!"}
        self.assertCountEqual(self.simultaneous("/api/password/reset/confirm/", [payload, payload]), [200, 400])

    def test_only_one_account_can_claim_an_email_simultaneously(self):
        payloads = []
        for username in ("first", "second"):
            user = User.objects.create_user(username=username, password="Original-password-912!")
            challenge = EmailChallenge.objects.create(user=user, email="shared@example.com")
            payloads.append({"token": signing.dumps({"user": user.pk, "nonce": str(challenge.nonce),
                "password": get_md5_hash_password(user.password)}, salt="accounts.verify")})
        self.assertCountEqual(self.simultaneous("/api/email/verify/confirm/", payloads), [200, 400])
        self.assertEqual(RecoveryEmail.objects.filter(email="shared@example.com").count(), 1)
