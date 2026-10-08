import logging
import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.utils import get_md5_hash_password
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .authentication import SessionObtainSerializer, SessionRefreshSerializer
from .models import EmailChallenge, LoginSession, RecoveryEmail
from .throttling import AccountThrottle

logger = logging.getLogger(__name__)


class EmailUnavailable(APIException):
    status_code = 503
    default_detail = "Email delivery is unavailable. Please try again later."


def deliver(email, subject, params):
    # Frontend origin is operator-configured, never supplied by Host or request data.
    link = settings.FRONTEND_ORIGIN + "/#" + urlencode(params)
    try:
        send_mail(subject, f"{subject}\n\nOpen TeamSync and confirm this action:\n{link}\n\nIf you did not request this, ignore this email.", settings.DEFAULT_FROM_EMAIL, [email])
    except (OSError, ValueError):
        # Do not log provider responses, addresses, credentials, or bearer links.
        logger.error("Account email delivery failed.")
        raise EmailUnavailable()


def password(user, value):
    try:
        validate_password(value, user=user)
    except DjangoValidationError as failure:
        raise ValidationError({"new_password": failure.messages})


class EmailInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().casefold()


class VerifyRequestInput(EmailInput):
    password = serializers.CharField(trim_whitespace=False, max_length=256)


class PasswordInput(serializers.Serializer):
    new_password = serializers.CharField(trim_whitespace=False, max_length=256)
    confirm_password = serializers.CharField(trim_whitespace=False, max_length=256)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise ValidationError({"confirm_password": "Passwords must match."})
        return attrs


class PasswordChangeInput(PasswordInput):
    current_password = serializers.CharField(trim_whitespace=False, max_length=256)


class ResetConfirmInput(PasswordInput):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=256)


class VerifyConfirmInput(serializers.Serializer):
    token = serializers.CharField(max_length=2048)


class SecurityView(APIView):
    throttle_classes = [AccountThrottle]
    auth_scope = "security"


class PublicSecurityView(SecurityView):
    permission_classes = [AllowAny]
    authentication_classes = []


class LoginView(TokenObtainPairView):
    serializer_class = SessionObtainSerializer
    throttle_classes = [AccountThrottle]
    auth_scope = "login"


class RefreshView(TokenRefreshView):
    serializer_class = SessionRefreshSerializer
    throttle_classes = [AccountThrottle]
    auth_scope = "refresh"


class LogoutView(SecurityView):
    def post(self, request):
        LoginSession.objects.filter(pk=request.auth["sid"], user=request.user).update(revoked=True)
        return Response(status=204)


class PasswordChangeView(SecurityView):
    @transaction.atomic
    def post(self, request):
        form = PasswordChangeInput(data=request.data)
        form.is_valid(raise_exception=True)
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if not user.check_password(form.validated_data["current_password"]):
            raise ValidationError({"current_password": "Your current password is incorrect."})
        password(user, form.validated_data["new_password"])
        user.set_password(form.validated_data["new_password"])
        user.save(update_fields=["password"])
        LoginSession.objects.filter(user=user).update(revoked=True)
        return Response(status=204)


class VerifyRequestView(SecurityView):
    auth_scope = "verify"

    @transaction.atomic
    def post(self, request):
        form = VerifyRequestInput(data=request.data)
        form.is_valid(raise_exception=True)
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if not user.check_password(form.validated_data["password"]):
            raise ValidationError({"password": "Your current password is incorrect."})
        challenge, _ = EmailChallenge.objects.update_or_create(user=user, defaults={"email": form.validated_data["email"], "nonce": uuid.uuid4()})
        token = signing.dumps({"user": user.pk, "nonce": str(challenge.nonce), "password": get_md5_hash_password(user.password)}, salt="accounts.verify")
        deliver(challenge.email, "Verify your TeamSync recovery email", {"action": "verify", "token": token})
        return Response({"detail": "Check your inbox to verify your recovery email."})


class VerifyConfirmView(PublicSecurityView):
    @transaction.atomic
    def post(self, request):
        form = VerifyConfirmInput(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            data = signing.loads(form.validated_data["token"], salt="accounts.verify", max_age=3600)
            user = User.objects.select_for_update().get(pk=data["user"], is_active=True)
            challenge = EmailChallenge.objects.select_for_update().get(user=user, nonce=data["nonce"])
            if data["password"] != get_md5_hash_password(user.password):
                raise ValueError()
        except (signing.BadSignature, User.DoesNotExist, EmailChallenge.DoesNotExist, KeyError, ValueError, TypeError):
            raise ValidationError({"detail": "This verification link is invalid or expired. Request a new one from My Account."})
        try:
            with transaction.atomic():
                RecoveryEmail.objects.update_or_create(user=user, defaults={"email": challenge.email})
        except IntegrityError:
            raise ValidationError({"detail": "This address cannot be used for this account. Choose another recovery email."})
        user.email = challenge.email
        user.save(update_fields=["email"])
        challenge.delete()
        return Response({"detail": "Your recovery email is verified."})


class ResetRequestView(PublicSecurityView):
    auth_scope = "reset"

    def post(self, request):
        form = EmailInput(data=request.data)
        form.is_valid(raise_exception=True)
        address = RecoveryEmail.objects.select_related("user").filter(email=form.validated_data["email"], user__is_active=True).first()
        if address and address.user.has_usable_password():
            try:
                deliver(address.email, "Reset your TeamSync password", {"action": "reset", "uid": urlsafe_base64_encode(force_bytes(address.user.pk)), "token": default_token_generator.make_token(address.user)})
            except EmailUnavailable:
                # Same response for known/unknown addresses, including provider failure.
                pass
        return Response({"detail": "If this is a verified recovery email, a reset link will arrive shortly."})


class ResetConfirmView(PublicSecurityView):
    @transaction.atomic
    def post(self, request):
        form = ResetConfirmInput(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            uid = urlsafe_base64_decode(form.validated_data["uid"]).decode()
            user = User.objects.select_for_update().get(pk=uid, is_active=True)
        except (ValueError, TypeError, UnicodeDecodeError, User.DoesNotExist, OverflowError):
            raise ValidationError({"detail": "This reset link is invalid or expired. Request a new one."})
        if not RecoveryEmail.objects.filter(user=user).exists() or not default_token_generator.check_token(user, form.validated_data["token"]):
            raise ValidationError({"detail": "This reset link is invalid or expired. Request a new one."})
        password(user, form.validated_data["new_password"])
        user.set_password(form.validated_data["new_password"])
        user.save(update_fields=["password"])
        LoginSession.objects.filter(user=user).update(revoked=True)
        return Response({"detail": "Password updated. Sign in with your new password."})
