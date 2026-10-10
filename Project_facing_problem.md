# Project-Facing Problem Inventory and Solutions

## Purpose

This inventory keeps implementation focused on real operational problems rather than adding unrelated features. Each entry explains the user-facing problem, the ResolveX response, and how completion can be checked.

| ID | Problem | Who is affected | ResolveX solution | Verification |
|---|---|---|---|---|
| P-01 | Complaints sent by chat, phone, or paper are lost or lack a reliable owner. | Students, residents, service teams | Store each request as a uniquely identified complaint with creator, status, timestamps, and optional assignee. | A student can submit a complaint and retrieve it later from their list. |
| P-02 | Users cannot tell whether a request is being handled. | Students and technicians | Provide explicit status transitions, assignment visibility, comments, resolution summary, and chronological history. | A full OPEN → ASSIGNED → IN_PROGRESS → RESOLVED lifecycle appears in the complaint timeline. |
| P-03 | Staff ownership is unclear and work may be assigned unfairly. | Administrators and technicians | Let admins assign/reassign staff; offer a transparent recommendation based on availability, supported category, and open workload. | Assignment is persisted, appears to the recipient, and is recorded in history/audit data. |
| P-04 | Urgent requests may wait without a deadline. | Students, admins, technicians | Calculate response and resolution deadlines from the active priority policy; identify overdue work. | Policy changes affect newly created complaints and eligible overdue work is escalated once. |
| P-05 | Users lack timely updates when ownership or status changes. | Students and technicians | Create recipient-scoped in-app notifications on key lifecycle events and expose read/unread actions. | Each event notifies only its intended recipient; another user cannot read it. |
| P-06 | A user could access another user's complaint or perform a role-only action. | All users | Enforce authentication, role authorization, ownership, and technician-assignment checks on the server. | Access-control tests reject unauthorized requests even when IDs are guessed. |
| P-07 | Complaint data can be silently changed without accountability. | Organization administrators | Keep history and audit records in separate append-only collections and record actor, event, old/new values, and timestamp. | Status and assignment changes create history; ordinary routes expose no edit/delete operation for historical data. |
| P-08 | Duplicate submissions and accidental retries create confusion. | Students and service staff | Use redirect-after-POST, validation, and clear feedback; keep stable complaint IDs. | Refresh after successful submission does not resubmit the form. |
| P-09 | Setup and handoff are ambiguous for the next developer. | Maintainers and reviewers | Document the stack, architecture, environment variables, scripts, demo accounts, tests, deployment steps, and limitations. | A new developer can follow README instructions to configure and start the app. |
| P-10 | Project execution can drift into non-MVP features. | Project contributors | Use a seven-day roadmap, acceptance gates, and explicit out-of-scope items. | Work remains focused on a working backend and complete complaint lifecycle. |

## User outcomes

### Student

- Registers and signs in securely.
- Creates a categorized complaint with a location.
- Sees only their own complaint data, updates, history, and notifications.
- Adds context and requests reopening if a resolution is unsatisfactory.

### Technician

- Sees work assigned to them, starts work, adds notes, and submits a resolution summary.
- Cannot alter another technician's workload or perform admin actions.

### Administrator

- Oversees organization-wide workload, overdue items, staff, priority, SLA policies, and assignment.
- Has an audit trail for consequential administrative actions.

## MVP exclusions

- Multi-organization tenancy, mobile apps, external email/SMS, payment processing, AI triage, duplicate detection, file uploads, distributed queues, and multi-instance scheduler coordination.

## Delivery acceptance checklist

- [ ] Student registration/login/logout works; passwords are never stored in plaintext.
- [ ] A student can submit and track a complaint and cannot read another student's private complaint.
- [ ] Admin can create/manage staff, set priority/SLA policy, and assign technicians.
- [ ] Technician can progress and resolve only assigned complaints.
- [ ] Invalid state transitions are rejected; valid transitions create history and relevant notifications.
- [ ] Overdue scanning records one escalation per breach and notifies administrators.
- [ ] CSRF protection, input validation, secure session configuration, and centralized safe errors are active.
- [ ] Role dashboards use real MongoDB queries.
- [ ] Test and setup instructions are documented.
