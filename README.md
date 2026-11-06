# Little Steps Nursery

A nursery-management monorepo with a Next.js public website and role-based portals, a NestJS REST API, PostgreSQL/Prisma, Redis-backed real-time messaging, and Kafka outbox processing.

## What is available

- Public pages: home, about, programs, admissions information, contact information, and nursery news articles.
- Parent portal: child records, attendance, meals, invoices, and secure messaging.
- Staff portal: assigned children, attendance, activities, meals, incidents, and secure messaging.
- Administration portal: children, parents, staff, user accounts, classrooms, attendance, activities, meals, invoices, tuition plans, revenue reports, health incidents, and messages.
- API authorization checks role and child access in the backend; the frontend is not the security boundary.

The admissions page submits real enrollment applications to the API, and administrators can review applications and update their status and internal notes. A status update does not create a child/enrollment record or send an email. Uploaded application documents and a full review timeline are not implemented; families are told to wait for secure instructions rather than email sensitive documents. Other areas in the supplied product brief remain incomplete: contact form persistence, full calendar/document management, medical allergy and medication screens, billing payment workflows in the dashboard, analytics charts/CSV exports, and complete edit/archive flows for all entities. Those pages are either informational or clearly report that the underlying workflow is not available; they do not fake a successful save.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL
- Redis (required for messaging and presence)
- Kafka is optional for local startup; outbox events stay in PostgreSQL until Kafka is available

## Local setup

From the repository root:

```powershell
npm install
Copy-Item .env.example apps\api\.env
```

Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` in `apps/api/.env`. Start PostgreSQL and Redis, then run:

```powershell
npm run prisma:generate -w api
npm run db:migrate
npm run dev
```

The web app is served at `http://localhost:3000`; the API is served at `http://localhost:4000/api/v1`. The development script starts both applications. Do not commit `.env` files or use development passwords outside a local environment.

If sign-in displays a network error such as “Failed to fetch”, make sure both the web and API processes are running and open the web app at `http://localhost:3000`. The API's `CORS_ORIGINS` setting must include the exact browser origin (scheme, hostname, and port); `localhost` and `127.0.0.1` are different origins. A network error is different from “Invalid credentials”, which means the API responded but did not accept the sign-in.

## Portals

- `/` — public website
- `/login` — sign in; successful login routes users to `/admin`, `/staff`, or `/parent` according to their API role
- `/admin` — administrator dashboard
- `/staff` — staff and teacher workspace
- `/parent` — parent portal
- `/chat` — real-time messaging
- `/signup` — explains that account creation is controlled by a nursery administrator; public self-registration is disabled

Administrative routes are role-guarded by the API. Parents only receive records for children linked to their account; staff access is scoped by their classroom assignments where supported by the endpoint.

## Validation

```powershell
npm run build
npm test
npm run lint
```

## Current implementation limits

This repository is not yet a complete production nursery-management product. The portal routes and many core APIs are now connected, but the remaining workflows listed above still need implementation and end-to-end testing. AWS deployment, full Docker orchestration, comprehensive business acceptance tests, and production security review must be completed before handling real family or child data.
