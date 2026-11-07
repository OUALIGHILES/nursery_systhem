# Phase 4 — Production Architecture

```
                ┌─────────────── nursery-net (bridge) ───────────────┐
                │                                                     │
Client ──► nginx:80/443 ──► web:3000 ──► api:4000 ──► postgres:5432  │
                                │             │      └► redis:6379     │
                                │             │      └► kafka:9092     │
                                │             └► worker: dist/worker/main
                                │                  (consumers + outbox relay)
                                └─ NEXT_PUBLIC_API_URL (browser-visible, public)
```

- **Web** (`apps/web/Dockerfile`): Next `start`, non-root, `expose: 3000` only.
- **API** (`apps/api/Dockerfile`): Nest `dist/main`, non-root, `EXPOSE 4000`, `HEALTHCHECK` → `/api/v1/health/email`.
- **Worker**: **shared API image**, `CMD ["node", "dist/worker/main"]`, no exposed ports. Runs the outbox relay + 5 consumer groups.
- **PostgreSQL 18**: `postgres-data` volume, `expose: 5432` (no host ports), `pg_isready` healthcheck.
- **Redis 7**: `--appendonly yes`, `redis-data` volume, `expose: 6379` (no host ports), `redis-cli ping` healthcheck.
- **Kafka KRaft 3.9**: single-node combined broker/controller, `kafka-data` volume, `expose: 9092` (no host ports). Advertised listeners use the Docker service name `kafka:9092`.

Only the reverse-proxy ports `80/443` are public in the `prod` profile. Everything else is internal DNS (`postgres`, `redis`, `kafka`, `api`, `web`). Production env is injected from `.env.production` (git-ignored); no hardcoded credentials.

## CI/CD at a glance

`ci.yml`: unit → lint → build (API+Web) → Prisma validate → isolated-PG integration → Docker builds → Compose config validation. `docker-build.yml`: GHCR push on `main`/`v*`/dispatch.

## Observability & backup

- Liveness: `GET /api/v1/health`, `GET /api/v1/readiness` → `{"status":"ok"}`.
- Dependency health: `GET /api/v1/health/email` → redacted SMTP/Kafka/Outbox summary (no payloads/secrets).
- Logs: structured Nest logs; redacted credential lines via `redactForLog`. Never log passwords/JWTs/PII.
- Outbox monitoring: `getPendingSummary()` via the health endpoint; admin `/admin/outbox/*` endpoints for inspection (historical events held by `OUTBOX_HISTORICAL_CUTOFF_ISO`).
- Backups: `pg_dump` against the `postgres-data` volume on a schedule (encrypted off-host); restore tested only with synthetic data, never against production parents data. Redis `AOF` persistence is a durability aid, not a backup.
