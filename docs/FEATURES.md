# TeamSync feature guide

Details of the task board, team invitations, project archiving, profiles, and account security.

## Task controls

Tasks have Low, Medium (default), High, or Urgent priority. Existing tasks receive
Medium priority when the migration runs. Create/edit dialogs save priorities via
the API, and cards display a priority badge.

Combine search, assignee, priority, and deadline filters; Clear filters restores
all tasks. Assigned to me and the assignee selector replace each other. Overdue
means the deadline has passed; Due today uses your local calendar day; Next 7 days
covers upcoming deadlines until midnight seven calendar days from today.
Completed tasks are excluded from these deadline views. No due date includes
completed tasks. Filters reset when navigating between projects.

Boards fetch up to 50 tasks per page, scoped to the selected project. Previous/
Next tasks navigate the matching results; changing filters returns to page one.
Search is debounced, limited to 200 characters, and matches title/description.
Project progress always counts every task, while column counts reflect all
matching tasks, including those on other pages. Empty columns explain when
their matching tasks are on another page.

The board calls `GET /api/tasks/?project=<id>&page=1`, with optional `search`,
`assignee` (member ID or `unassigned`), `priority`, and `status`. Date filters use
timezone-aware `due_from` (inclusive), `due_before` (exclusive), and
`incomplete=true`; no deadline uses `no_due_date=true`. Local calendar boundaries
come from the browser so Due today respects the user's timezone. Responses use
`{count, next, previous, results}`. `GET /api/tasks/summary/?project=<id>` accepts
the same filters and returns `all`/`filtered` counts plus an activity revision.
Inaccessible projects return 404. Detail/write operations ignore list filters.
Unscoped `/api/tasks/` without a page retains the legacy array response for
independent frontend/API rollouts; the current frontend always uses paged reads.

On desktop, drag a card using its grip into another column. Status dropdowns work
with keyboards and touch devices. Moves are shown only after the server saves
successfully; failed moves retain the original status and display an error.



## Task comments and activity

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

Visible pages check for updates approximately every 20 seconds and when focus
or connectivity returns. Hidden/offline pages pause; failures back off to at
most two minutes. Board notices include new activity, including comments on
tasks outside the current page. This is periodic refresh, not instant push or
an email/browser notification service. Failed reads preserve loaded work and
comment drafts; writes are not automatically retried.

Recent comments/activity refresh while a discussion is open. Editing, deletion,
and viewing older loaded pages pause discussion auto-refresh; use Refresh
discussion to return to the latest page. Unsent comment text stays in place.

Authenticated endpoints, all scoped to the task's team:

- `GET/POST /api/tasks/<id>/comments/`
- `PATCH/DELETE /api/tasks/<id>/comments/<comment_id>/` (author only)
- `GET /api/tasks/<id>/activity/` (read only)

Comments and activity return `{count, next, previous, results}` with 20 records
per page, newest first. Use `?page=2` and the UI's Load more buttons for older
entries. Refresh discussion retrieves current comments and history. Drafts remain
available after failed writes; successful writes are distinguished from a failed
subsequent refresh so users are not encouraged to submit duplicates.



## Team invitation links

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


## Project archive and restore

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


## Appearance and My Account

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
Team profile information follows existing membership visibility rules. Run migrations after pulling changes.


## Account security and recovery

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
[Vercel/Render/Resend setup guide](VERCEL_RENDER.md) for hosting and sender
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

## Account deletion

My Account includes a separate deletion confirmation. The API requires the
current password and exact username, then checks team roles again inside a
transaction. Promote another admin (or explicitly delete the team) before
deleting an account that is the only admin. Teams originally created by the
account are also checked even if the creator previously left them.

Deletion transfers team creation ownership to a remaining active admin,
removes memberships, unassigns tasks, and removes the profile/photo, recovery
email/challenges, and login sessions. Shared projects, tasks, and conversations
stay. Retained comment/activity attribution becomes “Deleted member”; original
comment text stays. This is not automatic deletion of user-written mentions or
provider logs/backups.

- `GET /api/account/deletion/` returns `can_delete` and `blocked_teams`.
- `POST /api/account/deletion/` takes `current_password` and `confirm_username`,
  returns 204, and invalidates existing access and refresh tokens.

## Slow connections

Requests taking more than six seconds show a server-startup notice. A 90-second
timeout returns control to the user; it does not sign them out or re-submit a
write. After a timed-out save, refresh and check the result before retrying.
Obsolete task requests are cancelled on filter/project changes, and older
responses cannot replace the current page.
