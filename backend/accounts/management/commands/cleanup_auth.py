from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import AuthBucket, LoginSession


class Command(BaseCommand):
    help = "Remove expired sessions and old authentication counters."

    def handle(self, *args, **options):
        now = timezone.now()
        sessions, _ = LoginSession.objects.filter(expires_at__lt=now).delete()
        buckets, _ = AuthBucket.objects.filter(starts_at__lt=now - timedelta(days=1)).delete()
        self.stdout.write(f"Removed {sessions} expired session records and {buckets} old counters.")
