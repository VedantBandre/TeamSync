from datetime import datetime, timezone as datetime_timezone

from django.contrib.auth.models import User
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

from .models import LoginSession


def active_session(token, user, lock=False):
    sessions = LoginSession.objects.select_for_update() if lock else LoginSession.objects
    try:
        session = sessions.get(pk=token.get("sid"), user=user, revoked=False, expires_at__gt=timezone.now())
    except (LoginSession.DoesNotExist, ValidationError, ValueError, TypeError):
        raise AuthenticationFailed("This session has ended. Please sign in again.")
    return session


class SessionAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        active_session(validated_token, user)
        return user


class SessionObtainSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["password"] = serializers.CharField(write_only=True, trim_whitespace=False, max_length=256)
        self.fields[self.username_field] = serializers.CharField(write_only=True, max_length=150)

    @transaction.atomic
    def validate(self, attrs):
        super().validate(attrs)
        # Serialize issuing sessions with password changes and account-wide logout.
        user = User.objects.select_for_update().get(pk=self.user.pk)
        if not user.is_active or not user.check_password(attrs["password"]):
            raise AuthenticationFailed("Unable to sign in with these credentials.")
        refresh = RefreshToken.for_user(user)
        session = LoginSession.objects.create(user=user, expires_at=datetime.fromtimestamp(refresh["exp"], tz=datetime_timezone.utc))
        refresh["sid"] = str(session.pk)
        return {"refresh": str(refresh), "access": str(refresh.access_token)}


class SessionRefreshSerializer(TokenRefreshSerializer):
    @transaction.atomic
    def validate(self, attrs):
        refresh = RefreshToken(attrs["refresh"])
        try:
            user = User.objects.select_for_update().get(pk=refresh.get("user_id"), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError):
            raise AuthenticationFailed("This session has ended. Please sign in again.")
        if refresh.get("hash_password") != get_md5_hash_password(user.password):
            raise AuthenticationFailed("This session has ended. Please sign in again.")
        active_session(refresh, user, lock=True)
        return {"access": str(refresh.access_token)}
