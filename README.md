# TeamSync

TeamSync is a team project-management application. Organizations contain projects,
and projects contain tasks with assignees, due dates, and TODO / IN_PROGRESS / DONE
statuses. The Django REST backend and React/TypeScript frontend support the core team
workflow, including account creation, project navigation, and a task board.

## Local setup

Use Python 3.12 or newer. From the repository root:

```sh
python3.12 -m venv backend/venv
backend/venv/bin/python -m pip install -r backend/requirements.txt
backend/venv/bin/python backend/manage.py migrate
backend/venv/bin/python backend/manage.py runserver
```

The API runs at `http://127.0.0.1:8000/api/`. SQLite is used for local development.
An optional Django admin account can be created with:

```sh
backend/venv/bin/python backend/manage.py createsuperuser
```

## Frontend

Use Node.js 24 or newer. Start Django using the instructions above, then in a
second terminal run these commands from the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open `http://127.0.0.1:5173`. The development server forwards `/api` requests to
Django at `http://127.0.0.1:8000`.

Create an account and sign in. Create a team and project, then add tasks, choose
assignees, set due dates, and move work between To do / In progress / Done.
Search and "Assigned to me" filter the current board.

Project URLs contain the selected team and project, for example
`/?team=1&project=2`. Refresh and browser Back/Forward preserve navigation, including
the Team members view. Project links in the sidebar support opening a new tab.
Use **Copy project link** on the board to share its address; if clipboard access
is unavailable, the app offers a selectable link. Signed-out users return to the
linked project after signing in. A link does not grant membership or bypass API
permissions. Missing, malformed, or inaccessible links show an unavailable screen
with a way back to your own workspace.

Links point to the host where TeamSync is running. A localhost link works on the
same computer; teammates on other computers need the app hosted at a shared address.

The Team members screen shows the team's members and exposes admin controls to add people, change roles,
rename the team, and remove members. Project/task editing and deletion are also
available, with confirmation before deletion.

To add a teammate, they first register and share the member ID displayed beside
their profile. Membership responses include a read-only `username` for display;
the existing `user` ID field is unchanged.

Tokens are kept in the current tab's session storage. Expired access tokens are
refreshed automatically; invalid refresh tokens return the user to sign-in.
Signing out revokes this login session on the server and clears this tab's tokens.
Password changes and resets revoke all of the account's sessions. No sample accounts or project data are inserted into your local
development database.

The frontend includes responsive layouts, keyboard-accessible native dialogs,
loading/error states, and bundled fonts. Direct dependency versions and the npm
lockfile are committed.

### Frontend checks

```sh
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

Browser tests run the complete workflow against Django at desktop and phone
viewport sizes and check automated accessibility rules on the sign-in screen
and task board:

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

The browser tests start their own servers on ports 8001 and 5174 and use
`backend/.e2e.sqlite3`, separate from `backend/db.sqlite3`. Each run creates unique
test accounts. Local runs use `backend/venv/bin/python`; set `TEAMSYNC_PYTHON` if
your Python environment lives elsewhere. Test screenshots and failure traces
are stored under `frontend/test-results/` and excluded from Git.

`.github/workflows/frontend.yml` runs formatting, lint, unit/component tests,
the production build, and browser tests on pushes and pull requests.

### Production build

```sh
npm --prefix frontend run build
```

Serve `frontend/dist` and route `/api/*` to Django. Alternatively, set
`VITE_API_BASE_URL` to your API URL before building and configure the backend's
allowed origins. See `frontend/.env.example`. The Vite development proxy is not a
production reverse proxy.

## API workflow

JSON requests should use `Content-Type: application/json`. Protected endpoints
require `Authorization: Bearer <access-token>`.

1. Register through `POST /api/register/` with `username`, `password`, and optional
   `email`. Password validation applies; passwords are stored hashed and never
   returned. The response contains the new user's ID.
2. Log in through `POST /api/token/` with `username` and `password` to obtain
   `access` and `refresh` tokens. Use `POST /api/token/refresh/` with `refresh` to
   renew the access token. `GET /api/me/` returns your ID, username, and email.
3. Create a team through `POST /api/organizations/` with `name`. The server sets
   you as its creator and adds your ADMIN membership in the same transaction.
4. Add an already registered user through `POST /api/memberships/` with `user`
   (their ID), `organization` (the team ID), and optional `role` (default MEMBER).
   This is direct membership management; email invitations are not implemented.
5. Create a project through `POST /api/projects/` with `organization`, `name`, and
   optional `description`.
6. Create a task through `POST /api/tasks/` with `project`, `title`, and optional
   `description`, `assigned_to` (a team member's ID), `status`, and `due_date`
   (an ISO 8601 timestamp, for example `2026-12-01T12:00:00Z`).
7. Update a task through `PATCH /api/tasks/<id>/`, for example
   `{"status": "IN_PROGRESS"}` or `{"status": "DONE"}`.

Organizations, memberships, projects, and tasks also expose list/detail GET,
PUT/PATCH, and DELETE operations under their respective `/api/` paths. Lists
contain only the caller's teams and their related records.

## Permissions and data rules

| Action within an organization | Admin | Member |
| --- | --- | --- |
| View organization, memberships, projects, and tasks | Yes | Yes |
| Rename or delete organization | Yes | No |
| Add/remove members or change roles | Yes | No |
| Create, edit, or delete projects | Yes | No |
| Create, edit, assign, or delete tasks | Yes | Yes |

Any registered user can create their own organization. Non-members cannot access
its objects: detail requests return 404, and attempts to reference another team's
organization/project in a request are rejected. Duplicate memberships are rejected.
The last admin cannot be removed or demoted; promote another member first.

Membership user/organization, project organization, and task project cannot be
changed after creation. Task assignees must belong to that task's organization.
Removing a membership clears that user's task assignments within the organization.
Deleting an organization deletes its memberships, projects, and tasks; deleting a
project deletes its tasks.

## Validation

From the repository root:

```sh
backend/venv/bin/python backend/manage.py check
backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
backend/venv/bin/python backend/manage.py test accounts organizations projects tasks config
```

The tests use a separate disposable database and cover authentication, the team
workflow, role restrictions, team isolation, assignment validation, and last-admin
protection. `.github/workflows/backend.yml` runs these checks for pull requests to
`main` and pushes to `main`, `dev/**`, and `fix/**`.

## Development workflow

Use `dev/<topic>` branches for development and `fix/<topic>` branches for focused
bug fixes. Keep `main` as the integration branch. Run the checks above, review the
diff, commit the related change, and open a pull request into `main`.

Local development defaults to SQLite and DEBUG enabled. Production configuration
is environment-based, requires a private secret and explicit hosts, disables DEBUG,
and requires PostgreSQL. See [deployment instructions](docs/DEPLOYMENT.md) and
[the development roadmap](docs/ROADMAP.md). Public hosting, authentication abuse
protection, email verification/recovery, and provider-specific backups/monitoring
remain separate milestones. Pagination and server-side filters are future work.

Core workflows, invitations, and project archiving are integrated into `main`.
The deployment foundation and profiles are integrated into `main`. Start new development
branches from updated `main`.

### Task controls

Tasks have Low, Medium (default), High, or Urgent priority. Existing tasks receive
Medium priority when the migration runs. Create/edit dialogs save priorities via
the API, and cards display a priority badge.

Combine search, assignee, priority, and deadline filters; Clear filters restores
all tasks. Assigned to me and the assignee selector replace each other. Overdue
means the deadline has passed; Due today uses your local calendar day; Next 7 days
covers upcoming deadlines until midnight seven calendar days from today.
Completed tasks are excluded from these deadline views. No due date includes
completed tasks. Filters reset when navigating between projects.

On desktop, drag a card using its grip into another column. Status dropdowns work
with keyboards and touch devices. Moves are shown only after the server saves
successfully; failed moves retain the original status and display an error.

Task controls are integrated into `main`.


### Task comments and activity

Open the comment icon on a task to view its discussion. Team members can post
plain-text comments (up to 4,000 characters), edit their own comments, and delete
them after confirmation. Authors are bound by the server. Other teammates can
read comments but cannot change them. Removed members and outsiders lose access.

The activity list records new task creation, changes to title, description,
status, priority, assignee, and deadline, plus comment additions, edits, and
removals. Automatic unassignment after member removal is recorded as well.
No-op edits produce no activity. Records and the changes they describe commit
in the same transaction. Comment text is not copied into activity records.
Authors' names remain visible if their user accounts are later removed.
Existing tasks start recording new changes; earlier activity is not fabricated.
Deleting a task/project/team also removes the related discussion and activity.
This is a collaboration history, not a permanent compliance audit log.

Authenticated endpoints, all scoped to the task's team:

- `GET/POST /api/tasks/<id>/comments/`
- `PATCH/DELETE /api/tasks/<id>/comments/<comment_id>/` (author only)
- `GET /api/tasks/<id>/activity/` (read only)

Comments and activity return `{count, next, previous, results}` with 20 records
per page, newest first. Use `?page=2` and the UI's Load more buttons for older
entries. Refresh discussion retrieves current comments and history. Drafts remain
available after failed writes; successful writes are distinguished from a failed
subsequent refresh so users are not encouraged to submit duplicates.

Task comments and activity are integrated into `main`.


### Team invitation links

In Team members, admins can create a link, copy it, and share it with a teammate.
Each link expires after seven days and can admit one signed-in user as a MEMBER.
Recipients can register or sign in without losing the invitation, preview the
team, and explicitly choose Join team. Joining opens the team's members page and
removes the invitation token from the current URL. No email provider is required;
email delivery and address-bound invitations are separate future improvements.

An admin can revoke an unused link after confirmation. Expired, revoked, used,
or deleted-team links cannot grant membership. A retry by the accepted recipient
is idempotent while they remain a member; removing them prevents reuse. Existing
members can open a valid link without consuming it or changing their role.

Tokens contain 32 random bytes. Only their SHA-256 digests are stored; the raw
token is returned once at creation and cannot be recovered by listing invitations.
Keep the generated link before navigating away, or revoke it and create another.
Anyone holding an active link can join, so share it with the intended teammate.
Invite responses use `Cache-Control: no-store`, and the frontend disables referrers.

Authenticated endpoints:

- `GET/POST /api/invitations/` (admins only; list optionally filters by `organization`)
- `GET /api/invitations/<id>/` (team admins only)
- `POST /api/invitations/<id>/revoke/` (team admins only)
- `POST /api/invitations/preview/` with `{token}` (preview without joining)
- `POST /api/invitations/accept/` with `{token}` (join as a MEMBER)

The list returns `{count, next, previous, results}` with 20 records per page.
Creation returns invitation metadata plus `token` once. Preview/accept return the
team name/ID, expiry, role, and whether the user was already a member. Invalid
links return 400/404; unavailable links return 410. Organization and invitation
locks plus a conditional claim keep acceptance and membership creation atomic.
SQLite does not provide production row locking; verify concurrent joins on the
production database before deployment. Treat invitation URLs as credentials and
exclude their query strings from production access logs and analytics.


### Project archive and restore

Admins can confirm **Archive project** on a board, then find it in **Archived
projects**. Archiving preserves tasks, comments, and activity; existing project
links still open a read-only board. Archived projects are omitted from active
project navigation and automatic board selection. Team members can read archived
work, while only admins can restore it. Restoration returns the project to the
active list and re-enables edits.

- `POST /api/projects/<id>/archive/` archives a project (admin only).
- `POST /api/projects/<id>/restore/` restores it (admin only).
- Both return the project and are idempotent. `archived_at` is read-only in normal
  project requests. List/detail reads include archived projects within the same
  membership scope.

The API rejects archived project edits, task creation/update/deletion, and comment
creation/update/deletion. Project rows are locked before content writes on
row-locking databases to coordinate them with archive/restore. SQLite is the local
development database; production concurrency should be verified on the chosen
production database. Membership removal still unassigns that user's tasks,
including archived ones, and records the access cleanup in task history.

Permanent deletion remains a separate confirmed admin action and removes the
project's tasks, comments, and history. Archiving is the option for preserving work.
Apply migrations after pulling this feature, including
`projects/0002_project_archived_at`.


### Appearance and My Account

Use the sidebar's Dark mode toggle for a dark forest/mint palette. Light mode
keeps the original colours. This browser remembers the choice across refreshes
and sign-in sessions; the preference is local to this browser.

Open **My Account** from the signed-in profile in the sidebar (`/?view=account`).
Save a display name, nickname, photo, and an emoji/text status. Status presets and
Clear status help update availability; status stays until explicitly changed.
Names, photos, and status appear in the sidebar and the team member list. Other
teammates see updates on their next workspace refresh.

`GET/PATCH /api/me/` reads/updates the caller's own profile. Username, email, member
ID, and permissions remain read-only. Existing accounts have empty profiles until
edited. Photos accept JPEG, PNG, and WebP under 2 MB/16 megapixels; the server
validates, crops, and re-encodes them as 256px JPEGs without source metadata using
[Pillow](https://pillow.readthedocs.io/en/stable/reference/Image.html). Compact
avatars are stored with profile records in the database and returned as data
URLs, so no public upload directory or media hosting is needed for this feature.
Team profile information follows existing membership visibility rules. Apply
`accounts/0001_initial` after pulling this branch.


### Account security and recovery

My Account includes recovery email verification and password changes. Enter your
current password to request a verification email. Follow the email and explicitly
confirm ownership before that address can recover your account. Changing the
recovery address requires verifying the new address; the existing verified
address remains valid until then. Verified addresses are unique ignoring case.
Legacy/optional registration emails are unverified and cannot reset passwords.
Accounts without a verified recovery email continue to work but cannot use email
recovery. New registrations are directed to My Account to enable recovery.

Forgot password on the sign-in screen requests a reset link. The response is the
same for known and unknown addresses. Verification and reset links expire after
one hour, are single-use, and require explicit confirmation. A new verification
request replaces the previous verification link. Password reset/change signs out
all sessions. The API checks a server-owned login session for both access and
refresh tokens; old tokens from before this milestone require signing in again.

Local email delivery writes private MIME files in `backend/.emails/` (ignored by
Git), not the console. Open the decoded text link from the file to test recovery.
Production email uses Resend's HTTPS API. See the
[Vercel/Render/Resend setup guide](docs/VERCEL_RENDER.md) for hosting and sender
configuration. Frontend origin is mandatory in production. Sender and Resend key
are required when email is enabled. The free Render Blueprint starts with
`EMAIL_DELIVERY=disabled`, allowing deployment before provider setup; My Account
shows that recovery is unavailable while password changes remain available.

Endpoints:

- `POST /api/logout/` ends the caller's session.
- `POST /api/password/change/` takes `current_password`, `new_password`, and `confirm_password`.
- `POST /api/email/verify/request/` takes `email` and current `password`.
- `POST /api/email/verify/confirm/` takes `token` (public, explicit action).
- `POST /api/password/reset/request/` takes `email` (public).
- `POST /api/password/reset/confirm/` takes `uid`, `token`, `new_password`, and `confirm_password` (public).

Authentication endpoints have persistent database rate counters across workers;
429 responses include Retry-After. Tests cover expired/reused links, duplicate
addresses, old session rejection, delivery failures, and simultaneous PostgreSQL
reset/verification requests. This is basic application abuse protection; deployment
proxy behavior and edge controls must be validated separately.
