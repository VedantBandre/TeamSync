# TeamSync

TeamSync is a team project-management application. Organizations contain projects,
and projects contain tasks with assignees, due dates, and TODO / IN_PROGRESS / DONE
statuses. The Django REST backend is implemented; the frontend folder is currently
empty.

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
before deployment. Email verification, invitations, password reset, and a frontend
are future work.
