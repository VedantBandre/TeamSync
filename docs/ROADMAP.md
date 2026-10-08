# TeamSync development roadmap

## Integrated into main

- Backend team/project/task workflow and permissions.
- Responsive frontend, project links, filters, priorities, and task moves.
- Task comments and activity history.
- Single-use team invitation links.
- Project archive and restore (PR #11).
- Environment-based deployment settings and PostgreSQL CI (PR #12).
- Green dark mode, My Account, profile photo, nickname, and status (PR #13).
- Invitation browser-test race fix.

## Current milestone: account security and recovery

Branch: `dev/account-security`, started from merged profiles and invitation fix.

Server-owned revocable login sessions, password change/reset, verified recovery
addresses, database-backed authentication rate limits, and complete browser flows.
Vercel/Render/Resend configuration is prepared in this branch. Actual provider
resources, delivery, backups/restore, and live smoke tests are not yet verified.
See [deployment setup](VERCEL_RENDER.md).

Selected hosting: Vercel for the frontend, Render for Django and private
PostgreSQL, and Resend for recovery emails. The deployment import configuration is
on `dev/deployment-setup`, based on `dev/account-security`; merge account security
first, then this deployment follow-up. Live provisioning still requires provider
access, private credentials, and approval of recurring hosting costs.

## Next milestones, in order

1. **Deployment:** choose hosting/domain, configure a trusted HTTPS proxy,
   static assets, secrets, database backups with a restore check, and monitoring.
   Validate concurrent invitations, last-admin protection, and archive/task writes
   against PostgreSQL before public launch.
2. **Larger workspaces:** pagination and server-side task search/filtering, with
   permission and navigation checks for paginated records.
3. **Live collaboration:** fresh task/discussion updates and useful notifications,
   with reconnect handling and membership checks.

Each milestone starts from updated main on a focused `dev/<topic>` branch. Use
`fix/<topic>` for isolated bug fixes. Run relevant checks, push the branch, and
review a pull request before merging. These are proposed priorities rather than
promises about release dates.
