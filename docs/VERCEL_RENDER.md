# Deploy TeamSync with Vercel, Render, and Resend

This is the selected deployment architecture: Vercel serves the frontend, and
Render serves Django and its private PostgreSQL database. No Vercel Services
configuration or service bindings are needed. The browser calls Render over HTTPS
with bearer tokens. The current folder structure already supports this split.

The frontend runs on Vercel; Django and PostgreSQL run on Render in Frankfurt.
`render.yaml` is a reviewable deployment template, not evidence of a live deployment.
Both resources explicitly select `plan: free`; the database has a fixed 1 GB limit.
No resources are created by committing this file, and no paid upgrades are
authorized. This is a free demo deployment, with these provider limits:

- The API sleeps after 15 minutes of inactivity; waking it can take about a minute.
- Free Render PostgreSQL expires after 30 days and has no managed backups.
  Export any data you want to keep before expiry. After the grace period, Render
  deletes the expired database. A longer-lived deployment needs a separate free
  PostgreSQL provider and private credential configuration; do not upgrade to paid.
- Free services have no pre-deploy command or dashboard/SSH shell.
- Free hours, bandwidth and build minutes are workspace-wide limits. Existing
  services share them. A free compute plan alone does not prevent usage charges
  when a payment method is on file: review billing/spend controls and stay within
  included usage. Do not add a payment method or enable paid overages for TeamSync.

## 1. Prepare email delivery

Email setup is optional for the first deployment. The Blueprint explicitly sets
`EMAIL_DELIVERY=disabled`, so no sender or Resend key is needed to start the API.
Sign-in, logout, profile editing and authenticated password changes still work.
My Account explains that email recovery is not configured. Recovery email requests
return a clear unavailable response, not a claim that a message was sent. Tokens
are not written to files or logs in this mode.

To enable email later, follow the steps below, set `DEFAULT_FROM_EMAIL` and
`RESEND_API_KEY` privately in Render, change `EMAIL_DELIVERY` to `resend` in the
Blueprint and service environment, then redeploy. Missing credentials in Resend
mode stop startup. The next `/api/me/` response enables the account recovery form.

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
from this repository. Verify **both** the web service and database show **Free**
before applying. If a free database is unavailable (only one is allowed per
workspace), stop; do not accept a paid substitute or reuse another app's database.
The service uses `backend` as its root, two Gunicorn workers, WhiteNoise for
Django admin/static assets, PostgreSQL 17, and `/health/` for health checks.
The free-compatible start command runs migrations and expired-auth cleanup before
starting Gunicorn. A failure stops startup. This preparation runs on restarts too;
migrations are repeatable and apply only pending changes. Keep schema migrations
compatible with the previous deployment during a rollout. This configuration is
for a single free service, not independently scaled app instances.

Enter the prompted private configuration:

| Variable | Value |
| --- | --- |
| `DJANGO_SECRET_KEY` | Privately generated random Django key, at least 50 characters |

The Blueprint already sets `FRONTEND_ORIGIN` and `DJANGO_CORS_ALLOWED_ORIGINS`
to `https://team-sync-omega-ruby.vercel.app`. Update both if the frontend changes.
There is no initial `DJANGO_ALLOWED_HOSTS` prompt: Render automatically supplies
`RENDER_EXTERNAL_HOSTNAME` during builds and runtime, and Django adds that exact
hostname when `RENDER=true`. Wildcards and malformed provider hostnames are
rejected. If you add a custom API domain later, set its exact hostname in
`DJANGO_ALLOWED_HOSTS`; the original Render hostname remains allowed too.

The Blueprint injects database credentials from its private Render database.
External database connections are disabled by default. No existing SQLite data
is automatically transferred. `DJANGO_TRUST_PROXY=true` is for Render's managed
HTTPS proxy only; do not reuse it behind an unsanitized proxy. Render may assign a
suffix to the service hostname: use the actual hostname displayed in its dashboard
for the Vercel API URL. Keep secrets stable between releases.

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

Open the Vercel URL and create an account. Check sign-in, sign-out, profile editing,
and authenticated password change (which signs out every session). When email is
disabled, confirm My Account states recovery is not configured and no verification
form appears. After enabling Resend, request and verify a recovery email, then
request a password reset and sign in with the new password. Confirm logout and
reset reject old sessions. Check dark
mode, project links, invitations, task updates, and archive/restore on a phone.
Check `https://<render-host>/health/` returns `{"status":"ok"}` and `/admin/`
loads its static styles. Use the dashboard's deploy logs without enabling request
body, Authorization header, invitation-query, or authentication-link logging.

Enable Render failure notifications. Check health when testing the deployment;
do not use artificial traffic to keep the free API awake. The free database has
no provider backups: keep private exports outside the service's ephemeral
filesystem and test restoring them into a separate local PostgreSQL instance.
For an export, temporarily allow only your own IP in database external access,
use the provider's external TLS connection credentials privately with `pg_dump`,
then remove that IP rule. Never commit exports or credentials. Export before the
30-day expiry; free Render PostgreSQL is not durable hosting for valuable data.
Keep a record of the deployed commit
and the previous successful release. Application rollback does not undo database
migrations; restore/forward-fix database changes deliberately.

Expired sessions and old rate counters are cleaned on startup. The free service
has no Render shell or paid cron configured. Keep the app's `/admin/` credentials
private; account API rate limits do not cover Django's admin login.

Sources: [Render Django deployment](https://render.com/docs/deploy-django),
[Blueprint reference](https://render.com/docs/blueprint-spec),
[Render free-instance limits](https://render.com/docs/free),
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Resend domains](https://resend.com/docs/dashboard/domains/introduction), and
[Resend test sender](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
