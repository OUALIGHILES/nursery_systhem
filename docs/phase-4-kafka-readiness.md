# Phase 4 — Kafka & Worker Readiness

## Worker architecture (verified, not newly invented)

A separate Worker process **already exists** in the codebase:

- `apps/api/src/worker/main.ts` — `NestFactory.createApplicationContext(WorkerModule)`, no HTTP server, `enableShutdownHooks()` + SIGTERM/SIGINT handlers.
- `apps/api/src/worker/worker.module.ts` — `WorkerService`, 5 consumers, `OutboxRelayService`.
- Docker image shares `apps/api/Dockerfile`; prod entry is `node dist/worker/main` (`docker-compose.production.yml:worker`, `docker-compose.yml:36-61`, `package.json: start:worker`).

The API process never runs the relay or consumers; the worker is the single relay membership. Do not add a second relay.

## Connection & lifecycle

- **Producer:** `KafkaProducerService` (`apps/api/src/kafka/kafka.producer.ts`) builds `kafkajs` from `KAFKA_BROKERS`, `KAFKA_SSL`, SASL, `KAFKA_REQUEST_TIMEOUT_MS`; lazy-connects; on broker-down `publish()` returns `false` instead of throwing. `OnApplicationShutdown` disconnects the producer.
- **Relay:** `OutboxRelayService.tick()` (`outbox-relay.service.ts:53-68`) no-ops while a tick is running, catches errors, logs `outbox.tick` summaries. Interval via `OUTBOX_RELAY_INTERVAL_MS` (default 2000). Historical `PENDING` rows are held by `OUTBOX_HISTORICAL_CUTOFF_ISO` (see `.env.example`) and are **never auto-published**.
- **Consumers:** `BaseEventConsumer.start()` subscribes with `allowAutoTopicCreation: false`, `autoCommit: false`. `processMessage` JSON-parses `eventId/payload`, dedupes via `ProcessedEvent`, retries 3× with `250ms·2^attempt` backoff, writes to `<topic>.dlq`, then still marks `ProcessedEvent`. Consumer groups: `nursery-audit`, `nursery-notifications`, `nursery-email`, `nursery-attendance`, `nursery-financial`.
- **Graceful shutdown:** `WorkerService.onApplicationShutdown()` stops consumers in order; relay clears its interval timer on destroy/shutdown. Producer `OnApplicationShutdown` disconnects.

## Integration test (isolated, no parent emails)

Ran against a local isolated KRaft broker (existing `docker compose` Kafka on `:9092`):

1. `npm run test:integration` (API) — 7 passed, including outbox atomicity (no rows on rollback, rows after commit, `eventId` uniqueness).
2. Unit: `outbox.service.spec.ts` (4), `base-consumer.spec.ts`, `consumers.spec.ts`, `worker.service.spec.ts`, `outbox-relay.service.spec.ts` — publish success / broker-down retry with backoff / `FAILED` after 5 attempts; consumer start-give-up after 5 attempts; relay tick summary.

No test emitted to production topics or contacted real parents.

## Result

Worker is production-ready as-is: retry/backoff, DLQ, dedupe, and graceful shutdown are all implemented and tested. The only manual runtime step is ensuring `KAFKA_BROKERS` points at the Docker service name (`kafka:9092`) in Compose, not `localhost`.
