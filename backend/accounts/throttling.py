"""Database-backed counters shared by all application workers."""
import hashlib
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.throttling import BaseThrottle

from .models import AuthBucket


class AccountThrottle(BaseThrottle):
    delay = 60

    def allow_request(self, request, view):
        scope = getattr(view, "auth_scope", None)
        if not scope or not settings.AUTH_RATE_LIMITS:
            return True
        # REMOTE_ADDR only: untrusted forwarded headers cannot bypass the limit.
        checks = [(scope + "_ip", request.META.get("REMOTE_ADDR", "unknown"))]
        if scope == "login":
            checks.append(("login_account", str(request.data.get("username", "")).strip().casefold()))
        elif scope == "reset":
            checks.append(("reset_email", str(request.data.get("email", "")).strip().casefold()))
        for name, identity in checks:
            limit, seconds = settings.AUTH_RATE_LIMITS.get(name, (30, 60))
            key = hashlib.sha256(f"{name}:{identity}".encode()).hexdigest()
            now = timezone.now()
            with transaction.atomic():
                AuthBucket.objects.get_or_create(key=key, defaults={"starts_at": now})
                bucket = AuthBucket.objects.select_for_update().get(pk=key)
                if bucket.starts_at + timedelta(seconds=seconds) <= now:
                    bucket.starts_at, bucket.count = now, 0
                if bucket.count >= limit:
                    self.delay = max(1, (bucket.starts_at + timedelta(seconds=seconds) - now).total_seconds())
                    return False
                bucket.count += 1
                bucket.save(update_fields=["starts_at", "count"])
        return True

    def wait(self):
        return self.delay
