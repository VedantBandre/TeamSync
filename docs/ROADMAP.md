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
- Server-owned login sessions, password changes, and verified email recovery.
- Free Render deployment support before email-provider setup.
- Responsive board column sizing and mobile layout improvements.

## Current branch: workspace reliability

`dev/workspace-reliability` adds slow-server feedback, bounded task paging and
server-side filters, periodic board/discussion refresh with in-app notices,
and confirmed account deletion that preserves shared work and team ownership.
Database-provider selection is deferred at the user's request. This branch
requires the new task indexes migration; merge and deploy after CI passes.

## Current status: deployed demo

The Vercel frontend is connected to the Render Django API and PostgreSQL.
Live browser checks passed for registration/sign-in, teams, projects, tasks,
comments, profiles, password changes, logout, and mobile layouts. Invitation and
archive workflows remain covered by the repository's automated browser tests;
these were not part of the live smoke test.

Resend delivery is not configured, so live email verification/recovery is
disabled. Password changes remain available. See [deployment setup](VERCEL_RENDER.md).

Render web/database plans are explicitly free; paid provisioning and upgrades
are not authorized. The free database's 30-day expiry makes this a temporary
demo. A longer-lived free database, backups with a restore check, and monitoring
remain unfinished.

## Next milestones, in order

1. **Deployment follow-through:** configure a verified Resend sender, test live
   recovery, select a longer-lived free database, and prepare backups/restore and
   monitoring. Validate invitations, role protection, and archive/task writes on
   the actual deployed PostgreSQL database before relying on it for ongoing work.
2. **Larger workspaces:** extend paging/scoping to team/project/member lists if
   needed, and measure search performance on larger datasets. Task paging and
   server-side filters are implemented on the current branch.
3. **Collaboration follow-through:** persistent notification inboxes and instant
   push updates if usage warrants them. Periodic refresh and in-app notices are
   implemented on the current branch.

Each milestone starts from updated main on a focused `dev/<topic>` branch. Use
`fix/<topic>` for isolated bug fixes. Run relevant checks, push the branch, and
review a pull request before merging. These are proposed priorities rather than
promises about release dates.
