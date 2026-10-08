"""HTTPS delivery works on Render without outbound SMTP ports."""
import json
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class DisabledBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if email_messages and not self.fail_silently:
            raise OSError("Email recovery is not configured.")
        return 0


class ResendBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            if not message.recipients():
                continue
            payload = json.dumps({"from": message.from_email, "to": message.to, "subject": message.subject, "text": message.body}).encode()
            request = Request("https://api.resend.com/emails", data=payload, headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json", "User-Agent": "TeamSync/1.0",
            })
            try:
                with urlopen(request, timeout=10) as response:
                    result = json.load(response)
                    if not isinstance(result, dict) or not result.get("id"):
                        raise OSError("Email delivery was not acknowledged.")
                sent += 1
            except (OSError, ValueError):
                if not self.fail_silently:
                    raise
        return sent
