# ResolveX Project Plan and Roadmap

## Project objective

Build ResolveX as a seven-day, backend-first complaint and service-request management MVP for a single college, hostel, PG, or apartment community. The core workflow must be usable end to end: a student creates a complaint, an administrator assigns a technician, the technician records work and resolves it, and the student can review the outcome and request reopening.

## Scope guardrails

- Use the specified stack: Node.js, Express, MongoDB, Mongoose, EJS, HTML/CSS, vanilla JavaScript, express-session, connect-mongo, bcrypt, express-validator, dotenv, method-override, Jest, and Supertest.
- Keep this a modular monolith with server-rendered pages; do not introduce a SPA, queue, Redis, Docker, or multi-tenant model.
- Prioritize authorization, auditable state changes, SLA deadlines, notifications, and reliable setup over optional polish.
- Do not implement email, AI assignment, duplicate detection, or production multi-instance scheduling in the MVP.
- Every dashboard must query persisted data; seed data is only for local demonstration.
- The supplied blue GIS dashboard image is a visual reference. Use its blue navigation, pale neutral canvas, compact stat cards, restrained chart colors, and clear table layout in the ResolveX UI.

## Architecture at a glance

Express routes and middleware form the HTTP boundary. Controllers validate route-level inputs and choose views/redirects. Services own the complaint workflow, SLA calculation, assignment, notifications, and audit rules. Mongoose models persist users, complaints, history, comments, notifications, SLA policies, and audit events. EJS renders escaped server-provided data through shared layout and partials. An in-process SLA monitor scans eligible complaints at a configurable interval and uses an idempotent update to avoid duplicate escalation records.

### Core data relationships

- `User` creates complaints, is assigned to complaints, authors comments, and receives notifications.
- `Complaint` references its creator and optional assigned technician; history and comments are stored in separate collections.
- `ComplaintHistory` is append-only business history. `AuditLog` records sensitive administrative actions.
- `SLAPolicy` defines response and resolution targets by priority.
- `Notification` belongs to one recipient and may link to a complaint.
- Persistent sessions use MongoDB through connect-mongo.

## Seven-day delivery roadmap

### Day 1 — Foundation
- Create package configuration, app/server entry points, MongoDB connection, environment validation, session storage, shared EJS layout, base CSS, and global error handling.
- Define User, Complaint, ComplaintHistory, Comment, Notification, SLAPolicy, and AuditLog schemas and indexes.
- Confirm the server starts only with valid configuration and database connectivity.

### Day 2 — Authentication and access control
- Implement student registration, login, logout, bcrypt password hashing, session regeneration, session destruction, CSRF tokens, login throttling, and active-account checks.
- Add authentication and role middleware; never trust role, creator, status, assignment, or SLA values from submitted forms.

### Day 3 — Complaint lifecycle
- Implement student complaint creation/list/detail/comment/reopen flows.
- Implement admin assignment/reassignment/priority controls and technician start/progress/resolution flows.
- Centralize legal status transitions, ownership checks, history writes, and notifications in services.

### Day 4 — SLA and notification workflows
- Add configurable priority-based deadlines, admin SLA-policy management, overdue scanning, idempotent escalation history, and in-app notifications.
- Prevent overlapping scheduler executions in one process and document its single-instance limitation.

### Day 5 — Role dashboards and usability
- Connect student, technician, and admin dashboards to real database queries.
- Add complaint filters, clear status/priority badges, category summaries, unread notification count, responsive navigation, empty/error states, and accessible forms.

### Day 6 — Security and automated verification
- Exercise registration, login, role boundaries, complaint privacy, valid/invalid transitions, assignment, history, SLA calculations/escalations, notifications, and invalid IDs.
- Fix regressions found by tests; ensure test data uses an isolated test database.

### Day 7 — Handoff and deployment readiness
- Provide a demo seed command, complete setup and deployment documentation, check environment examples and ignore rules, and run the full test suite.
- Capture application screenshots only after a real local run; do not claim a deployment that did not occur.

## Implementation order and completion gates

1. **Foundation gate:** application imports, required environment variables are validated, Mongo connection errors are explicit, and shared views render.
2. **Security gate:** no protected route is reachable without a session; role-specific actions are checked server-side; state-changing forms require CSRF.
3. **Workflow gate:** the full student → admin → technician → student loop works and generates immutable history plus targeted notifications.
4. **SLA gate:** deadlines come from persisted policies and repeat scans do not duplicate escalation.
5. **Handoff gate:** demo seed, environment setup, documented limitations, and automated test results are available.

## Decisions and known boundaries

- Calendar-time SLA targets are used (not business hours).
- The first registered account is a student. Admins and technicians are provisioned through the admin staff screen or seed command; public registration cannot select a privileged role.
- Student complaints are private to their creator; assigned technicians and admins can see only the records needed for their role.
- The SLA monitor is an in-process timer. It is acceptable for a single-instance MVP, but production horizontal scaling requires a coordinated scheduler/locking design.
- MongoDB transactions are not assumed, so the workflow uses explicit service operations and durable idempotency markers where possible.
- In this development environment MongoDB tooling is not available by default; runtime verification requires a local or hosted MongoDB URI.
