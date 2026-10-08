"""Local browser-test settings. Never use these for a deployed application."""
from .settings import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / ".e2e.sqlite3",  # noqa: F405
    }
}
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
AUTH_RATE_LIMITS = {}
EMAIL_BACKEND = "django.core.mail.backends.filebased.EmailBackend"
EMAIL_FILE_PATH = BASE_DIR / ".e2e-emails"
FRONTEND_ORIGIN = "http://127.0.0.1:5174"
