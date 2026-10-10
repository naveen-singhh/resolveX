# ResolveX

ResolveX is a backend-first complaint and service-request management system for a college, hostel, PG accommodation, apartment community, or small organization. It replaces scattered WhatsApp, phone, and paper requests with a private, auditable workflow for students, technicians, and administrators.

> The dashboard styling takes visual direction from the supplied blue GIS dashboard reference: deep-blue navigation, a light neutral canvas, compact summary cards, clear tables, and restrained status colors. The original reference image is included in `src/public/images/dashboard-reference.jpg` and shown on the sign-in page.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Demo accounts and seed data](#demo-accounts-and-seed-data)
- [Commands](#commands)
- [Routes](#routes)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Roadmap and problem inventory](#roadmap-and-problem-inventory)
- [Known limitations](#known-limitations)

## Features

- Student registration and session-based login.
- Server-rendered student, technician, and administrator dashboards.
- Private complaint submission, list, detail, comments, and history.
- Admin technician/staff management, assignment/reassignment, priority changes, SLA policy management, and operational summaries.
- Technician work-start and resolution actions with work notes.
- Audited status transitions, notifications, and SLA escalation.
- Role authorization, complaint ownership checks, input validation, CSRF protection, login throttling, and safe error pages.
- Transparent assignment recommendation based on technician availability, category support, and open workload.

## Technology stack

| Area | Technology |
|---|---|
| Runtime | Node.js (CommonJS JavaScript) |
| Server and routing | Express.js |
| Database and ODM | MongoDB, Mongoose |
| Views | EJS, HTML5, CSS3, minimal vanilla JavaScript |
| Authentication/session | express-session, connect-mongo, bcrypt |
| Validation and forms | express-validator, method-override |
| CSRF | csrf-csrf, cookie-parser |
| Configuration | dotenv |
| Testing | Jest, Supertest, mongodb-memory-server |

No frontend framework, queue, Redis, SQL database, or container runtime is required.

## Architecture

This is a modular monolithic Express application:

```text
src/
  app.js                 Express setup, common middleware, routes, error handling
  server.js              Environment validation, DB startup, SLA monitor lifecycle
  config/                Environment, MongoDB, session-store setup
  models/                Mongoose schemas and indexes
  routes/                Auth, complaint, role dashboard, admin, notification routes
  controllers/           HTTP request/response handlers
  services/              Complaint workflow, assignment, SLA, notification, audit rules
  middleware/            Authentication, roles, CSRF, flash, validation, errors
  jobs/                  In-process overdue complaint scanner
  views/                 EJS layouts, shared partials, and role/error pages
  public/                CSS, browser JS, and supplied dashboard reference image
scripts/
  seed.js                Idempotent local demo data setup
tests/
  app.test.js            Route/workflow/security and SLA tests
```

Routes are the HTTP boundary; controllers translate requests into service calls; services enforce business rules and persist history/notifications; models define stored data; EJS renders escaped server data. Complaint history, comments, audit logs, and notifications are separate collections rather than unbounded embedded arrays.

### Complaint state flow

Normal flow: `OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`.

Supported alternate actions include admin reassignment, admin cancellation, and student reopening of a resolved/closed complaint. A centralized transition service checks role and current state; there is no general-purpose status edit field.

## Data model

| Model | Main purpose |
|---|---|
| User | Normalized email, bcrypt hash, role, availability, supported categories, active flag |
| Complaint | Complaint details, creator/assignee, priority/status, SLA timestamps, resolution |
| ComplaintHistory | Append-only lifecycle, assignment, priority, work-note, and escalation history |
| Comment | User-authored complaint discussion |
| Notification | Recipient-scoped in-app notifications and read state |
| SLAPolicy | Response/resolution target minutes for each priority |
| AuditLog | Administrative actions without sensitive credentials |

Important indexes cover normalized unique email, creator/assignee complaint lists, status/priority/deadlines, chronological complaint history, notifications by recipient/read state, and idempotency keys for escalations.

## Requirements

- Node.js 20 or later (Node 22 LTS recommended).
- npm.
- MongoDB 6 or later, local or hosted. Local MongoDB Community Server is sufficient for development.

## Local setup

1. Install Node.js and start a MongoDB service, or provision a MongoDB database.
2. From the project folder, install dependencies:

   ```powershell
   npm install
   ```

3. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Update `MONGODB_URI` and replace `SESSION_SECRET` with a random secret of at least 32 characters. Keep `.env` private; it is ignored by git.
5. Optionally insert sample data:

   ```powershell
   npm run seed
   ```

6. Start the development server:

   ```powershell
   npm run dev
   ```

7. Visit `http://localhost:3000`. Public registration creates a student account. Use the seeded admin and technician accounts for the staff workflow.

The process checks required environment variables before listening and exits explicitly if MongoDB cannot connect. For a non-Windows shell, replace `Copy-Item` with the platform's file-copy equivalent.

## Environment variables

| Variable | Required | Default / example | Description |
|---|---:|---|---|
| `NODE_ENV` | No | `development` | `production` enables secure cookies and production-safe error output. |
| `PORT` | No | `3000` | HTTP port. |
| `MONGODB_URI` | Yes | `mongodb://127.0.0.1:27017/resolvex` | Application database URI. |
| `SESSION_SECRET` | Yes | See `.env.example` | Long, random signing secret (32+ characters). |
| `SESSION_MAX_AGE_MS` | No | `86400000` | Session lifetime in milliseconds. |
| `SLA_SCAN_INTERVAL_MS` | No | `60000` | In-process overdue scan cadence; minimum 10 seconds. |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt work factor (10–14 recommended). |
| `SEED_ADMIN_EMAIL` | No | `admin@resolvex.local` | Seed account email. |
| `SEED_ADMIN_PASSWORD` | No | Local-only sample in `.env.example` | Seed account password; change it for any non-local use. |
| `SEED_TECH_EMAIL` | No | `tech@resolvex.local` | Seed technician email. |
| `SEED_TECH_PASSWORD` | No | Local-only sample in `.env.example` | Seed account password; change it for any non-local use. |
| `SEED_STUDENT_EMAIL` | No | `student@resolvex.local` | Seed student email. |
| `SEED_STUDENT_PASSWORD` | No | Local-only sample in `.env.example` | Seed account password; change it for any non-local use. |

## Demo accounts and seed data

`npm run seed` creates or updates one admin, two technicians, eight students, default SLA policies, and 24 realistic complaints with a mix of open, assigned, in-progress, resolved, closed, reopened, and cancelled statuses. The seed also creates histories, comments, and notifications so the dashboards have useful records immediately.

The seeded student accounts are `student@resolvex.local`, `riya.mehta@resolvex.local`, `kabir.patel@resolvex.local`, `ananya.iyer@resolvex.local`, `dev.malhotra@resolvex.local`, `ishita.rao@resolvex.local`, `neel.gupta@resolvex.local`, and `sara.khan@resolvex.local`. Both technicians (`tech@resolvex.local` and `tech2@resolvex.local`) use the configured technician demo password. Seeded students use the configured student demo password. Configure demo credentials in `.env` before running the seed. Defaults are intentionally local-only; never reuse them in production. Seeded complaint records are matched by student and title, so rerunning refreshes the same set instead of creating duplicate demo complaints.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Start the production-mode server. |
| `npm run dev` | Start with Node's built-in watch mode. |
| `npm test` | Run Jest/Supertest tests against an isolated in-memory MongoDB instance. |
| `npm run test:watch` | Run Jest in watch mode. |
| `npm run seed` | Create local demo data using `.env`. |

## Routes

### Authentication

- `GET/POST /register`, `GET/POST /login`, `POST /logout`

### Student and shared complaint pages

- `GET /dashboard`, `GET /complaints`, `GET /complaints/new`, `POST /complaints`
- `GET /complaints/:id`, `POST /complaints/:id/comments`, `POST /complaints/:id/reopen`

### Technician

- `GET /technician/dashboard`
- `POST /technician/complaints/:id/start`
- `POST /technician/complaints/:id/resolve`
- `POST /technician/complaints/:id/comments`

### Administrator

- `GET /admin/dashboard`, `GET /admin/complaints`
- `POST /admin/complaints/:id/assign`, `POST /admin/complaints/:id/priority`
- `GET/POST /admin/staff`, `POST /admin/staff/:id`
- `GET /admin/sla-policies`, `POST /admin/sla-policies/:priority`
- `GET /admin/audit-logs`

### Notifications

- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

Invalid MongoDB IDs and inaccessible complaint resources receive not-found behavior. Successful form posts redirect to prevent accidental resubmission.

## Security

- Passwords are bcrypt hashes; hashes are excluded from view locals.
- Public signup is student-only; staff are created/managed by an admin or seed.
- Sessions are MongoDB-backed, HttpOnly, SameSite=Lax, and Secure in production; the session ID is regenerated after login and destroyed at logout.
- State-changing forms include a csrf-csrf signed double-submit token.
- Login attempts are throttled in-process.
- Express-validator checks user input; Mongoose IDs are validated before lookup.
- Server-side ownership and role checks protect complaint data and actions.
- EJS uses escaped interpolation for user-provided content.
- User-supplied role, creator, status, assignee, priority, deadline, and history values are not mass-assigned.
- Production error pages avoid stack traces and internal details.
- Use HTTPS, a strong environment-specific secret, a protected MongoDB user, and appropriate network controls in production.

## Testing

Run `npm test`. Tests use `mongodb-memory-server` and a separate disposable database, not the configured application database. The suite exercises authentication/session behavior, validation, complaint privacy, role access, assignment and lifecycle changes, history/notifications, and SLA calculations/escalation idempotency. If the MongoDB binary is not cached, the test dependency may need internet access once to download it.

## Deployment

1. Deploy Node.js 20+ and a managed MongoDB instance reachable from the application.
2. Configure `NODE_ENV=production`, `PORT`, `MONGODB_URI`, and a unique strong `SESSION_SECRET`; set `SESSION_MAX_AGE_MS` and `SLA_SCAN_INTERVAL_MS` as needed.
3. Install production dependencies with `npm ci --omit=dev` after generating and committing a lockfile.
4. Run `npm start` behind an HTTPS-terminating reverse proxy or platform ingress; forward the proxy protocol correctly if using secure cookies behind a proxy.
5. Seed the first admin through a controlled secure environment if appropriate, then rotate demo credentials and do not expose seed passwords.
6. Configure MongoDB backups, monitoring, TLS, least-privilege credentials, and a deployment health check before handling real complaints.

The included scheduler is in-process and intended for one running application instance. Do not run multiple instances with this scheduler and expect coordinated SLA processing; a distributed lock or managed scheduler is required before horizontally scaling.

## Roadmap and problem inventory

- [Project plan and seven-day roadmap](./PLANNING_AND_ROADMAP.md)
- [Project-facing problem inventory and solutions](./Project_facing_problem.md)

The seven-day sequence starts with architecture and database foundation, then authentication, workflow, SLA/notifications, dashboards, tests/security, and final handoff. The roadmap documents acceptance gates and known constraints so contributors can stay within the MVP.

## Known limitations

- One organization-wide admin role; no tenant partitioning.
- Calendar-time SLA; no business-hour calendar.
- Single-process SLA scheduler; not coordinated across multiple server instances.
- In-memory login throttling resets when the process restarts and is not a distributed rate limiter.
- No email/SMS, attachments, external integrations, or multi-factor authentication.
- MongoDB transactions are not assumed for standalone deployments.
