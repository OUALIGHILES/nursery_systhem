# Integration testing (Phase 3)

Destructive or concurrency tests run **only** against an isolated PostgreSQL
database — never the development/production `nursery` database.

Local setup (Docker, used for the Phase 3 run):

```powershell
docker run -d --name nursery-pg-test -e POSTGRES_USER=nursery `
  -e POSTGRES_PASSWORD=ghiles -e POSTGRES_DB=nursery_test `
  -p 5433:5432 postgres:18-alpine

$env:DATABASE_URL='postgresql://nursery:ghiles@localhost:5433/nursery_test?schema=public'
npm run prisma:migrate -w api

$env:INTEGRATION_DATABASE_URL='postgresql://nursery:ghiles@localhost:5433/nursery_test?schema=public'
npm run test:integration -w api
```

Configuration:

- `INTEGRATION_DATABASE_URL` selects the test DB (falls back to the Docker
  URL above for local runs).
- `vitest.integration.config.ts` includes `**/*.integration-spec.ts`.
- Fixtures use a random suffix and are cleaned per test (applications,
  classrooms, children, users, outbox and audit rows created by that suffix).

Cleanup:

```powershell
docker stop nursery-pg-test
docker rm nursery-pg-test
```
