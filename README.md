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
Signing out clears this tab's tokens. It does not revoke already issued tokens
on the server. No sample accounts or project data are inserted into your local
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
backend/venv/bin/python backend/manage.py test accounts organizations projects tasks
```

The tests use a separate disposable database and cover authentication, the team
workflow, role restrictions, team isolation, assignment validation, and last-admin
protection. `.github/workflows/backend.yml` runs these checks for pull requests to
`main` and pushes to `main`, `dev/**`, and `fix/**`.

## Development workflow

Use `dev/<topic>` branches for development and `fix/<topic>` branches for focused
bug fixes. Keep `main` as the integration branch. Run the checks above, review the
diff, commit the related change, and open a pull request into `main`.

The current settings are for local development, with DEBUG enabled, a development
secret key, and permissive CORS. Before public deployment, configure secrets,
allowed hosts/origins, HTTPS, and abuse protection for authentication endpoints.
SQLite does not provide the row locking used to serialize concurrent admin
removals; verify concurrency behavior on a production database such as PostgreSQL
before deployment. Email verification, invitations, password reset, and production deployment
are future work. The frontend currently loads all accessible records; pagination
and server-side board filters are future improvements for larger workspaces.

The frontend was started on `dev/frontend-workflow` from `dev/backend-workflow`.
If the backend pull request is still open, review the frontend against that branch
first. Once the backend is merged, update the frontend branch against `main` before
opening its final pull request.

Project navigation changes are isolated on `dev/project-navigation`, based on
`dev/frontend-workflow`. Review this branch against the frontend branch until
that work is merged into `main`.
