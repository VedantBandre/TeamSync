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
