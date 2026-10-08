# Deployment foundation

This milestone supplies validated configuration and database checks. Hosting,
live email delivery, backups, and public release require provider setup.
See [the Vercel/Render/Resend guide](VERCEL_RENDER.md) for the prepared hosting configuration.

## Environment settings

Django reads process environment variables. It does **not** automatically read
`.env`. `backend/.env.example` is a reference; configure values through your hosting
provider or a private shell environment. Keep private files out of Git.

Local development needs no environment file: DEBUG is enabled, SQLite uses the
existing `backend/db.sqlite3`, and CORS allows the two localhost Vite origins.
The browser test database remains separate.

Production requires:

| Variable | Value |
| --- | --- |
| `DJANGO_ENV` | `production` |
| `DJANGO_SECRET_KEY` | A privately generated random key, at least 50 characters |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated explicit backend host names |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` | PostgreSQL credentials and host |
| `DB_PORT` | Optional; defaults to `5432` |
| `DB_SSLMODE` | `require` by default; `verify-ca`/`verify-full` also supported |
| `DJANGO_CORS_ALLOWED_ORIGINS` | HTTPS frontend origins if frontend/API origins differ |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Explicit HTTPS origins for cross-origin session/admin forms, if needed |
| `FRONTEND_ORIGIN` | One exact HTTPS frontend origin for recovery links |
| `DEFAULT_FROM_EMAIL` | Verified Resend sending address |
| `RESEND_API_KEY` | Private sending key, entered in Render |
| `DJANGO_TRUST_PROXY` | `true` only for a trusted proxy that strips/replaces incoming `X-Forwarded-Proto` |

`DJANGO_DEBUG` defaults to false in production and cannot be enabled there. Unsafe
or incomplete configuration stops startup rather than falling back to local
settings. PostgreSQL is mandatory in production. For local PostgreSQL testing,
set `DB_ENGINE=postgresql`, credentials above, and `DB_SSLMODE=disable` only for the
local test database. Changing databases does not transfer existing SQLite data.

Generate a secret privately with Django's `get_random_secret_key()`. Do not use
the development key or the dummy values in CI. `require` encrypts the database
connection; use `verify-full` and your provider's CA configuration when certificate
and host verification is required.

Production redirects HTTP to HTTPS, enables secure session/CSRF cookies, HSTS,
content-type protection, and a no-referrer policy. HTTPS must be configured on the
fronting proxy. HSTS applies to subdomains and is preload-capable, so ensure the
chosen domain and its subdomains support HTTPS before deployment.

## Build and run

Install the pinned requirements, then with production variables configured:

```sh
backend/venv/bin/python backend/manage.py check --deploy --fail-level WARNING
backend/venv/bin/python backend/manage.py migrate --noinput
backend/venv/bin/python backend/manage.py collectstatic --noinput
npm --prefix frontend ci
npm --prefix frontend run build
backend/venv/bin/gunicorn --chdir backend config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --error-logfile -
```

Serve `frontend/dist` with SPA fallback to `index.html`, forward `/api/` and
`/admin/` to Gunicorn, and serve Django's collected files at `/static/` from
`backend/staticfiles`. Restrict Gunicorn/database access to the proxy/application.
The Vite proxy and Django runserver are development tools. If API/frontend use
different origins, build with `VITE_API_BASE_URL` and configure exact CORS origins.

Gunicorn access logging is intentionally not enabled in the command. Configure
proxy/application monitoring without recording invitation query tokens, passwords,
authorization headers, or request bodies. Choose a worker count for the hosting
resources; two workers is a starting example.

## Validation and rollout

CI runs backend tests on SQLite and PostgreSQL 17. The PostgreSQL job also applies
migrations and runs Django's deployment checks with dummy production variables.
This checks configuration and database compatibility; it does not verify your
provider's TLS, backups, reverse proxy, or concurrent production workloads.

Before public launch, complete the next roadmap milestones: live email delivery,
staging checks on the actual database, backups with
a tested restore, and monitoring. Deploy database migrations once per release
before starting new application workers. Record a rollback/data recovery plan;
changing configuration alone is not a SQLite-to-PostgreSQL data migration.

References: [Django deployment checklist](https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/)
and [PostgreSQL backend documentation](https://docs.djangoproject.com/en/6.0/ref/databases/#postgresql-notes).
