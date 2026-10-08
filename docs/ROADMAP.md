# TeamSync development roadmap

## Integrated into main

- Backend team/project/task workflow and permissions.
- Responsive frontend, project links, filters, priorities, and task moves.
- Task comments and activity history.
- Single-use team invitation links.
- Project archive and restore (PR #11).
- Environment-based deployment settings and PostgreSQL CI (PR #12).

## Current milestone: appearance and personal profiles

Branch: `dev/account-and-dark-mode`.

A persistent dark mode toggle using the existing green palette, and My Account
with editable display name, nickname, photo, and emoji/text status. Shared profile
information appears in the team list; identity and permissions stay server-owned.

## Next milestones, in order

1. **Account safety and recovery:** authentication abuse protection, email
   verification, password reset, and server-side token revocation. Choose an email
   provider and resolve existing accounts without unique/verified email addresses.
2. **Staging deployment:** choose hosting/domain, configure a trusted HTTPS proxy,
   static assets, secrets, database backups with a restore check, and monitoring.
   Validate concurrent invitations, last-admin protection, and archive/task writes
   against PostgreSQL before public launch.
3. **Larger workspaces:** pagination and server-side task search/filtering, with
   permission and navigation checks for paginated records.
4. **Live collaboration:** fresh task/discussion updates and useful notifications,
   with reconnect handling and membership checks.

Each milestone starts from updated main on a focused `dev/<topic>` branch. Use
`fix/<topic>` for isolated bug fixes. Run relevant checks, push the branch, and
review a pull request before merging. These are proposed priorities rather than
promises about release dates.
