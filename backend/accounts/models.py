import uuid

from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=80, blank=True)
    nickname = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=120, blank=True)
    status_emoji = models.CharField(max_length=16, blank=True)
    # Small, normalized avatars travel with profile data; no public upload directory.
    avatar = models.BinaryField(null=True, blank=True)


class LoginSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    expires_at = models.DateTimeField(db_index=True)
    revoked = models.BooleanField(default=False)


class RecoveryEmail(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recovery_email")
    # Stored casefolded; legacy User.email values are never automatically trusted.
    email = models.EmailField(unique=True)


class EmailChallenge(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    email = models.EmailField()
    nonce = models.UUIDField(default=uuid.uuid4)


class AuthBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    starts_at = models.DateTimeField()
    count = models.PositiveIntegerField(default=0)
