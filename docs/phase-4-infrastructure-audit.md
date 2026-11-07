# Phase 4 — Infrastructure Audit

## 1. Current infrastructure

| Component | Status | Details |
|---|---|---|
| `apps/api` | Present — `apps/api/Dockerfile` exists | Node 20 Alpine multistage; `prisma generate` + `nest build`; runtime `node dist/main` on `:4000`; no non-root user; no healthcheck. |
| `apps/web` | **No Dockerfile** | Next.js 16 App Router; needs a Dockerfile. |
| Worker | **Exists** — `apps/api/src/worker/main.ts` + `WorkerModule` (`apps/api/src/worker/`) | Separate `NestFactory.createApplicationContext`, consumes Kafka groups + runs `OutboxRelayService`; `enableShutdownHooks()` + SIGTERM/SIGINT. Shares the API image/entry `node dist/worker/main`. Already in `docker-compose.yml:36-61`. Do not duplicate. |
| PostgreSQL | Dev: native service `:5432`. Compose: **absent** | Prisma `postgresql`, adapter `@prisma/adapter-pg` (`apps/api/src/prisma/prisma.service.ts`), migrations in `apps/api/prisma/migrations/`. `DATABASE_URL` from env, secrets never in repo (`.gitignore` covers `.env`). |
| Redis | Compose `redis:7-alpine` on `6379` (exposed). | `RedisService` (`messaging/redis.service.ts`) with 3 connections (client/publisher/subscriber) + Socket.IO Redis adapter (`main.ts:14-15`). |
| Kafka KRaft | Compose `apache/kafka:3.9`, single node, `KAFKA_PROCESS_ROLES=broker,controller`, volume `kafka-data`; healthcheck via `kafka-topics.sh --list`. | `KafkaProducerService` (`apps/api/src/kafka/kafka.producer.ts`) + 5 `BaseEventConsumer`s (`Audit`, `Notification`, `Email`, `Attendance`, `Financial`) with `ProcessedEvent` dedupe (`@@unique(eventId)`, `@@index(consumerGroup)`). `OutboxRelayService` polls `OUTBOX_RELAY_INTERVAL_MS` (default 2000) in the **worker only**. |
| Health | `GET /api/v1/health/email` (`EmailHealthController`) | Public, redacted; checks SMTP verify + Kafka `isConfigured/isConnected` + outbox pending summary. Ideal for Compose/README healthchecks. Root `GET /api/v1/` returns `Hello World!` only. |
| Env | `.env.example` (placeholders) | No real secrets. API env strictly validated by `apps/api/src/config/env.ts` (Zod, e.g. JWT secrets ≥32 chars). `.dockerignore` excludes `node_modules`, `dist`, `.next`, `.env*` except `*.example`. |
| CI | **No `.github/workflows/` content found** in the pre-Phase-4 repo state. | `package.json` workspaces scripts exist (`build`, `lint`, `test`, `db:migrate`, `prisma:generate`, `dev:worker`). |

## 2. Missing components

1. **Web Dockerfile** (none).
2. **Production Compose** — existing `docker-compose.yml` is a dev/local stack (Kafka+Redis+Worker only, host Docker-internal URLs, Redis/Kafka published, `command: ["node", "dist/worker/main"]`). No `api`, `web`, `postgres` services; no healthchecks for app services; no production overrides.
3. **Non-root + healthchecks** in the API Dockerfile (`USER` missing, no `HEALTHCHECK`).
4. **CI** — no GitHub Actions workflows.
5. **Terraform** — `infrastructure/` is an empty directory; docs were empty before Phase 4.
6. **Observability/backup runbooks** — only the `health/email` endpoint and `OutboxRelayService` logs exist.

## 3. Reusable configurations

- API Dockerfile build steps, `docker-compose.yml` Kafka KRaft env and `kafka-data` volume, `.dockerignore`, `.gitignore`, `.env.example`, `Env` validation, `WorkerModule`/`WorkerService` lifecycle, `OutboxRelayService` interval envs, `Health/email` endpoint, `package.json` scripts, Prisma provider lock.

## 4. Architectural risks

1. **`aggregator` complexity:** `app.module.ts` imports `OutboxAdminModule` + `MailAdminModule` into the API process; the worker must not also run them (it does not — `WorkerModule` is separate).
2. **Dev Compose uses `host.docker.internal`** for worker DB/Redis — breaks in Linux prod containers. Production must use service DNS (`postgres:5432`, `redis:6379`, `kafka:9092`).
3. **Exposed stateful ports:** `6379`, `9092` published to host in dev Compose — must be internal-only in prod.
4. **No readiness probes:** Redis/Kafka healthchecks exist for Kafka only; API/Web have none.
5. **SMTP + Kafka DLQ/ProcessedEvent idempotency** is tested at unit/integration level only; no broker soak test exists.
6. **Single-node Kafka** (KRaft combined broker/controller, RF=1) is fine locally but not HA.

## 5. Recommended production architecture

```
Client → Web (Next.js, :3000 behind reverse proxy) → API (NestJS, :4000)
                                    API → PostgreSQL :5432 (internal only, volume)
                                    API → Redis :6379 (internal only, AOF persistence)
                                    API → Kafka :9092 (KRaft) (internal only, volume)
Worker (node dist/worker/main) → Kafka + PostgreSQL + Redis + SMTP (no HTTP ports)
                         ↑ shared image with API (different CMD)
Internal network: nursery-net (single bridge). Only the reverse-proxy port is public.
```

No new Kafka/Worker architecture. CI runs unit + lint + builds + isolated-PG integration + Docker builds. Terraform is provider-neutral until the target cloud is chosen (see `docs/phase-4-architecture.md`).

## 6. Proposed implementation sequence (Phase 4 order)

1. This audit.
2. Web Dockerfile + production Compose + non-root API image + healthchecks.
3. Kafka/worker readiness doc based on the existing Worker (no new process).
4. `ci.yml` + `docker-build.yml` (isolated-PG integration, no prod APIs).
5. Provider-neutral Terraform skeleton + environments.
6. Deployment + observability/backup docs.
7. Validation: builds, `docker compose config`, `docker build`, `terraform fmt/validate` (provider-neutral parts only).

