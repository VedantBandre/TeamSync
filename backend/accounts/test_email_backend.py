import json
from urllib.error import URLError
from unittest.mock import patch

from django.core.mail import EmailMessage
from django.test import SimpleTestCase, override_settings

from .email_backend import ResendBackend


@override_settings(RESEND_API_KEY="test-only")
class EmailDeliveryTests(SimpleTestCase):
    def message(self):
        return EmailMessage("Verify your email", "Test link", "sender@example.com", ["owner@example.com"])

    def test_delivery_uses_https_api_and_requires_acknowledgement(self):
        with patch("accounts.email_backend.urlopen") as send:
            send.return_value.__enter__.return_value.read.return_value = b'{"id":"test-id"}'
            self.assertEqual(ResendBackend().send_messages([self.message()]), 1)
            request = send.call_args.args[0]
            self.assertEqual(request.full_url, "https://api.resend.com/emails")
            self.assertEqual(json.loads(request.data)["to"], ["owner@example.com"])
            self.assertEqual(send.call_args.kwargs["timeout"], 10)
            send.return_value.__enter__.return_value.read.return_value = b'[]'
            with self.assertRaises(OSError):
                ResendBackend().send_messages([self.message()])

    def test_delivery_failure_raises_unless_explicitly_silent(self):
        with patch("accounts.email_backend.urlopen", side_effect=URLError("provider-unavailable")):
            with self.assertRaises(OSError):
                ResendBackend().send_messages([self.message()])
            self.assertEqual(ResendBackend(fail_silently=True).send_messages([self.message()]), 0)
