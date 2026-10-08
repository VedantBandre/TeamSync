# Deploy TeamSync with Vercel, Render, and Resend

This is the selected deployment architecture: Vercel serves the frontend, and
Render serves Django and its private PostgreSQL database. No Vercel Services
configuration or service bindings are needed. The browser calls Render over HTTPS
with bearer tokens. The current folder structure already supports this split.

The frontend runs on Vercel; Django and PostgreSQL run on Render in Frankfurt.
`render.yaml` is a reviewable deployment template, not evidence of a live deployment.
It selects paid web/database compute with 1 GB database storage. Review Render's
current billing before creating it. No services or paid resources are created by
committing this file. Free Render PostgreSQL expires after 30 days; use that only
for disposable experiments, not the durable deployment described here.

## 1. Prepare email delivery

Create a Resend account. Add a domain you control in its Domains screen and add
its required DNS records at your domain provider. Wait for Resend to verify the
sending domain. Create a sending API key and keep it in Render's private environment
settings. Set `DEFAULT_FROM_EMAIL` to an address at the verified domain, such as
`teamsync@example.com`. Keep click tracking disabled for authentication emails.

Without a domain, Resend's `onboarding@resend.dev` sender can be used only for
restricted testing to the email address associated with your Resend account.
That is enough to test your own recovery flow; it is not general email delivery.
Do not paste API keys into chat or commit them. The app sends mail through HTTPS,
so it does not depend on SMTP ports blocked by Render's free web services.

## 2. Reserve the frontend URL

Import `VedantBandre/TeamSync` in Vercel. Choose **Vite**, not **Services**.
Keep Root Directory at the repository root: root `vercel.json` explicitly installs
with `npm --prefix frontend ci`, builds with `npm --prefix frontend run build`,
and publishes `frontend/dist`. Set Node.js **24.x**. If the import suggestion says
multiple services, change the Framework Preset to Vite before deploying.
Alternatively, choosing **frontend** as Root Directory uses `frontend/vercel.json`
with `npm run build` and `dist`; both configurations deploy only the frontend.
Use a stable
production URL or custom domain. The first build can run before the backend is
available; set the real API URL and redeploy after step 3.

Both Vercel configurations provide SPA fallback and response security headers.
Recovery links use URL fragments so their secrets are not sent to Vercel in HTTP
requests. The app removes the fragment on opening, and requires explicit
confirmation before consuming a link. If you refresh that confirmation screen,
reopen the link from the email.

## 3. Create the Render backend/database

After merging account security and the deployment configuration to main, create a Render Blueprint
from this repository. Review the proposed compute/database costs and values.
The service uses `backend` as its root, two Gunicorn workers, WhiteNoise for
Django admin/static assets, PostgreSQL 17, and `/health/` for health checks.
Migrations run once in the pre-deploy step, before new application workers start.

Enter the prompted private configuration:

| Variable | Value |
| --- | --- |
| `DJANGO_SECRET_KEY` | Privately generated random Django key, at least 50 characters |
| `DJANGO_ALLOWED_HOSTS` | Exact Render backend hostname, e.g. `teamsync-api-abc.onrender.com` |
| `FRONTEND_ORIGIN` | Stable HTTPS frontend origin, e.g. `https://teamsync.vercel.app` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | The same exact frontend origin |
| `DEFAULT_FROM_EMAIL` | Your verified Resend sender (or restricted test sender above) |
| `RESEND_API_KEY` | Your private sending key |

The Blueprint injects database credentials from its private Render database.
External database connections are disabled by default. No existing SQLite data
is automatically transferred. `DJANGO_TRUST_PROXY=true` is for Render's managed
HTTPS proxy only; do not reuse it behind an unsanitized proxy. Render may assign a
suffix to the service hostname: use the actual hostname displayed in its dashboard
and redeploy if the initial value differs. Keep secrets stable between releases.

The API rate limiter uses database counters shared across workers and
`REMOTE_ADDR`, ignoring untrusted forwarded headers. Behind Render this may group
visitors by proxy address; account/email limits still apply separately. This is a
conservative personal-deployment default, not a DDoS service. Validate actual
proxy behavior before expanding to a multi-user public service; add trusted edge
controls rather than blindly trusting user-supplied forwarding headers.

## 4. Connect Vercel to the API

In Vercel's Production environment, set `VITE_API_BASE_URL` to
`https://<actual-render-host>/api` and redeploy. This value is public configuration,
not a secret. Keep Django secrets, database passwords, and the Resend key out of
Vercel frontend variables. API requests go directly to Render using bearer tokens;
frontend/API cross-origin cookies are not required. Preview deployments do not
have API access unless their exact origins are explicitly configured.

## 5. Verify the live application

Open the Vercel URL and create an account. In My Account, request a recovery email
and verify it. Sign out, request a password reset, follow the email, and sign in
with the new password. Confirm logout and reset reject old sessions. Check dark
mode, project links, invitations, task updates, and archive/restore on a phone.
Check `https://<render-host>/health/` returns `{"status":"ok"}` and `/admin/`
loads its static styles. Use the dashboard's deploy logs without enabling request
body, Authorization header, invitation-query, or authentication-link logging.

Enable Render failure notifications and monitor the health endpoint. Confirm the
chosen database plan's backups/retention and test a restore into a separate
instance before putting valuable data in it. Keep a record of the deployed commit
and the previous successful release. Application rollback does not undo database
migrations; restore/forward-fix database changes deliberately.

Expired sessions and old rate counters are cleaned during releases. For a long
period without releases, run `python manage.py cleanup_auth` periodically from
Render's shell (or schedule it separately). Keep the app's `/admin/` credentials
private; account API rate limits do not cover Django's admin login.

Sources: [Render Django deployment](https://render.com/docs/deploy-django),
[Blueprint reference](https://render.com/docs/blueprint-spec),
[Render free-instance limits](https://render.com/docs/free),
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Resend domains](https://resend.com/docs/dashboard/domains/introduction), and
[Resend test sender](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
