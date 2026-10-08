"""Environment configuration shared by development, CI, and production."""
import os
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


DEVELOPMENT_SECRET = "django-insecure-+ngmcu0en*o6e&zp%)()3z8+0mxt4rm$9gt5z(x8f^vwd#ys!a"


def configuration(base_dir, environ=None):
    env = os.environ if environ is None else environ

    def required(name):
        value = env.get(name, "")
        if not value.strip():
            raise ImproperlyConfigured(f"{name} is required.")
        return value

    def boolean(name, default):
        value = env.get(name, str(default)).strip().lower()
        if value not in ("true", "false", "1", "0"):
            raise ImproperlyConfigured(f"{name} must be true or false.")
        return value in ("true", "1")

    def items(name, default=""):
        return [item.strip() for item in env.get(name, default).split(",") if item.strip()]

    environment = env.get("DJANGO_ENV", "development").strip().lower()
    if environment not in ("development", "production"):
        raise ImproperlyConfigured("DJANGO_ENV must be development or production.")
    production = environment == "production"
    debug = boolean("DJANGO_DEBUG", not production)
    secret = env.get("DJANGO_SECRET_KEY", DEVELOPMENT_SECRET if not production else "")
    hosts = items("DJANGO_ALLOWED_HOSTS", "" if production else "localhost,127.0.0.1,[::1]")
    if production:
        if debug:
            raise ImproperlyConfigured("DJANGO_DEBUG cannot be enabled in production.")
        if len(secret) < 50 or len(set(secret)) < 5 or secret.startswith("django-insecure-"):
            raise ImproperlyConfigured("Production requires a strong DJANGO_SECRET_KEY (at least 50 characters).")
        if not hosts or any("*" in host for host in hosts):
            raise ImproperlyConfigured("Production requires explicit DJANGO_ALLOWED_HOSTS without wildcards.")

    def origins(name, default=""):
        values = items(name, default)
        for value in values:
            try:
                parsed = urlsplit(value)
                parsed.port  # Validate malformed and out-of-range ports.
            except ValueError as failure:
                raise ImproperlyConfigured(f"{name} contains an invalid origin.") from failure
            if (parsed.scheme not in ("http", "https") or not parsed.hostname
                    or parsed.path or parsed.query or parsed.fragment
                    or parsed.username or parsed.password or "*" in value
                    or (production and parsed.scheme != "https")):
                raise ImproperlyConfigured(f"{name} must contain explicit {'HTTPS' if production else 'HTTP(S)'} origins without paths.")
        return values

    engine = env.get("DB_ENGINE", "postgresql" if production else "sqlite").strip()
    if engine == "sqlite" and not production:
        database = {"ENGINE": "django.db.backends.sqlite3", "NAME": base_dir / "db.sqlite3"}
    elif engine == "postgresql":
        sslmode = env.get("DB_SSLMODE", "require" if production else "disable")
        modes = ("disable", "allow", "prefer", "require", "verify-ca", "verify-full")
        if sslmode not in modes or (production and sslmode not in modes[3:]):
            raise ImproperlyConfigured("DB_SSLMODE must be a valid libpq mode; production requires require, verify-ca, or verify-full.")
        port = env.get("DB_PORT", "5432")
        if not port.isdigit() or not 1 <= int(port) <= 65535:
            raise ImproperlyConfigured("DB_PORT must be a valid port number.")
        database = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": required("DB_NAME"), "USER": required("DB_USER"),
            "PASSWORD": required("DB_PASSWORD"), "HOST": required("DB_HOST"),
            "PORT": port, "CONN_MAX_AGE": 60, "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": sslmode, "connect_timeout": 10},
        }
    else:
        raise ImproperlyConfigured("DB_ENGINE must be sqlite (development only) or postgresql.")

    config = {
        "DEBUG": debug, "SECRET_KEY": secret, "ALLOWED_HOSTS": hosts,
        "DATABASES": {"default": database},
        "CORS_ALLOW_ALL_ORIGINS": False,
        "CORS_ALLOWED_ORIGINS": origins("DJANGO_CORS_ALLOWED_ORIGINS", "" if production else "http://localhost:5173,http://127.0.0.1:5173"),
        "CSRF_TRUSTED_ORIGINS": origins("DJANGO_CSRF_TRUSTED_ORIGINS"),
        "SECURE_SSL_REDIRECT": production,
        "SESSION_COOKIE_SECURE": production, "CSRF_COOKIE_SECURE": production,
        "SECURE_HSTS_SECONDS": 31536000 if production else 0,
        "SECURE_HSTS_INCLUDE_SUBDOMAINS": production,
        "SECURE_HSTS_PRELOAD": production,
        "SECURE_CONTENT_TYPE_NOSNIFF": True,
        "SECURE_REFERRER_POLICY": "no-referrer",
        "STATIC_ROOT": base_dir / "staticfiles",
    }
    frontend = origins("FRONTEND_ORIGIN", "" if production else "http://127.0.0.1:5173")
    if len(frontend) != 1:
        raise ImproperlyConfigured("FRONTEND_ORIGIN must be one explicit frontend origin.")
    delivery = env.get("EMAIL_DELIVERY", "resend" if production else "file")
    if delivery not in ("file", "resend") or (production and delivery != "resend"):
        raise ImproperlyConfigured("Production requires EMAIL_DELIVERY=resend.")
    sender = env.get("DEFAULT_FROM_EMAIL", "" if production else "teamsync@localhost")
    if not sender or "\n" in sender or "\r" in sender:
        raise ImproperlyConfigured("DEFAULT_FROM_EMAIL is required and cannot contain newlines.")
    config.update({
        "FRONTEND_ORIGIN": frontend[0], "DEFAULT_FROM_EMAIL": sender,
        "EMAIL_BACKEND": "accounts.email_backend.ResendBackend" if delivery == "resend" else "django.core.mail.backends.filebased.EmailBackend",
        "EMAIL_FILE_PATH": base_dir / ".emails",
        "RESEND_API_KEY": required("RESEND_API_KEY") if delivery == "resend" else "",
    })
    # Opt in only when a trusted proxy strips incoming X-Forwarded-Proto.
    if boolean("DJANGO_TRUST_PROXY", False):
        config["SECURE_PROXY_SSL_HEADER"] = ("HTTP_X_FORWARDED_PROTO", "https")
    return config
