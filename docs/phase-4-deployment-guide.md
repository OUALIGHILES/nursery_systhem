# Phase 4 — Deployment Guide

## Stages (GitHub Actions)

1. **Code quality** — `ci.yml`: Prisma validate + generate, unit tests, API lint, web lint.
2. **Integration** — isolated PostgreSQL service (GitHub Actions `services.postgres`), migrated + `test:integration`.
3. **Image build** — `.github/workflows/docker-build.yml` on `push`/`v*` tags and manual dispatch; builds `apps/api/Dockerfile` and `apps/web/Dockerfile`, tags `:sha` + `:latest`, pushes to GHCR.
4. **Deploy** — manual until a target server/cloud is chosen. In production, `docker compose -f docker-compose.production.yml pull && docker compose -f docker-compose.production.yml up -d`.
5. **Health verification** — `GET /api/v1/health` and `GET /api/v1/health/email` (redacted SMTP/Kafka/Outbox summary); Docker `HEALTHCHECK`s cover the API (`/api/v1/health/email`).
6. **Rollback** — `docker compose -f docker-compose.production.yml up -d --force-recreate` with the previous `IMAGE_TAG`; DB is **never** rolled back automatically (no `prisma migrate` on rollback).

## Environments & secrets

Use GitHub Actions **environments** (`dev`, `staging`, `production`) with protected secrets:

`POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_PASSWORD`, `STRIPE_SECRET_KEY`, `KAFKA_SASL_PASSWORD` (if used).

Never commit `.env.production`; it is git-ignored and must be injected by the runner or the host.

## Rollback procedure

1. Identify the last good `IMAGE_TAG` (GitHub Actions run).
2. On the host: `IMAGE_TAG=<prev-sha> docker compose -f docker-compose.production.yml pull && docker compose -f docker-compose.production.yml up -d`.
3. Verify `/api/v1/health` and `/api/v1/health/email`.
4. Do **not** run `prisma migrate` or delete volumes on rollback.

## Pre-requisites before automatic production deployment

Cloud provider + region + domain + registry must be chosen (see `infrastructure/terraform/README.md`). Automatic deployment stays **disabled** until then.
