from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from .environment import configuration


class EnvironmentTests(SimpleTestCase):
    def production(self, **overrides):
        return {
            "DJANGO_ENV": "production",
            "DJANGO_SECRET_KEY": "production-test-key-only-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "DJANGO_ALLOWED_HOSTS": "api.example.com",
            "DB_NAME": "teamsync", "DB_USER": "teamsync", "DB_PASSWORD": "test-only",
            "DB_HOST": "db.example.com", **overrides,
        }

    def test_local_defaults_use_sqlite_and_explicit_cors_origins(self):
        settings = configuration(Path("/app"), {})
        self.assertTrue(settings["DEBUG"])
        self.assertEqual(settings["DATABASES"]["default"]["NAME"], Path("/app/db.sqlite3"))
        self.assertFalse(settings["CORS_ALLOW_ALL_ORIGINS"])
        self.assertIn("http://127.0.0.1:5173", settings["CORS_ALLOWED_ORIGINS"])
        self.assertNotIn("SECURE_PROXY_SSL_HEADER", settings)

    def test_production_enforces_https_and_postgresql(self):
        settings = configuration(Path("/app"), self.production())
        self.assertFalse(settings["DEBUG"])
        self.assertTrue(settings["SECURE_SSL_REDIRECT"])
        self.assertTrue(settings["SESSION_COOKIE_SECURE"])
        self.assertTrue(settings["CSRF_COOKIE_SECURE"])
        self.assertEqual(settings["SECURE_REFERRER_POLICY"], "no-referrer")
        db = settings["DATABASES"]["default"]
        self.assertEqual(db["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(db["OPTIONS"]["sslmode"], "require")

    def test_production_rejects_missing_secrets_hosts_and_database_credentials(self):
        for name in ("DJANGO_SECRET_KEY", "DJANGO_ALLOWED_HOSTS", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST"):
            with self.subTest(name=name), self.assertRaises(ImproperlyConfigured):
                configuration(Path("/app"), self.production(**{name: ""}))

    def test_production_rejects_unsafe_configuration(self):
        for name, value in (
            ("DJANGO_DEBUG", "true"), ("DJANGO_SECRET_KEY", "a" * 60),
            ("DJANGO_ALLOWED_HOSTS", "*"), ("DB_ENGINE", "sqlite"),
            ("DB_SSLMODE", "disable"), ("DB_SSLMODE", "prefer"),
            ("DJANGO_CORS_ALLOWED_ORIGINS", "http://app.example.com"),
            ("DJANGO_CSRF_TRUSTED_ORIGINS", "https://*.example.com"),
        ):
            with self.subTest(name=name, value=value), self.assertRaises(ImproperlyConfigured):
                configuration(Path("/app"), self.production(**{name: value}))

    def test_invalid_values_fail_instead_of_silently_falling_back(self):
        for name, value in (("DJANGO_ENV", "prod"), ("DJANGO_DEBUG", "yes"), ("DJANGO_TRUST_PROXY", "maybe"), ("DB_ENGINE", "mysql"), ("DB_PORT", "0"), ("DB_PORT", "broken"), ("DB_SSLMODE", "typo")):
            with self.subTest(name=name), self.assertRaises(ImproperlyConfigured):
                configuration(Path("/app"), self.production(**{name: value}))

    def test_origin_lists_are_explicit_and_trimmed(self):
        settings = configuration(Path("/app"), self.production(DJANGO_CORS_ALLOWED_ORIGINS=" https://app.example.com, https://other.example.com "))
        self.assertEqual(settings["CORS_ALLOWED_ORIGINS"], ["https://app.example.com", "https://other.example.com"])
        for value in ("*", "https://app.example.com/path", "https://user:password@app.example.com", "https://app.example.com?q=1", "https://app.example.com#fragment", "https://app.example.com:bad", "https://[bad]"):
            with self.subTest(value=value), self.assertRaises(ImproperlyConfigured):
                configuration(Path("/app"), {"DJANGO_CORS_ALLOWED_ORIGINS": value})

    def test_proxy_header_trust_is_explicit(self):
        settings = configuration(Path("/app"), self.production(DJANGO_TRUST_PROXY="true"))
        self.assertEqual(settings["SECURE_PROXY_SSL_HEADER"], ("HTTP_X_FORWARDED_PROTO", "https"))

    def test_development_can_use_postgresql_without_tls(self):
        settings = configuration(Path("/app"), self.production(DJANGO_ENV="development", DB_ENGINE="postgresql"))
        self.assertEqual(settings["DATABASES"]["default"]["OPTIONS"]["sslmode"], "disable")
