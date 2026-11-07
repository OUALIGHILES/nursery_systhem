# Phase 7 — Parent Communication Audit (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only · Status: **Inbox missing, persistence exists**

## What exists
- `Notification {id, userId FK cascade, type CHECK_IN|CHECK_OUT|ABSENCE|INVOICE|PAYMENT|MESSAGE|INCIDENT|ENROLLMENT|ACTIVITY|GENERAL, channel IN_APP|EMAIL, title, body, link?, readAt?, createdAt}` + index `[userId,readAt]`. **No** `NotificationController/Service/Module` — write-only.
- **Writers (Kafka consumers, deduped via `ProcessedEvent` + manual commit):**
  - `NotificationEventConsumer (nursery-notifications)`: `notification.requested` (single GENERAL), `enrollment.approved/rejected → ENROLLMENT (/parent/applications)`, `incident.reported → notifyUsers` (parentUserIds).
  - `AttendanceEventConsumer (nursery-attendance)`: `checked_in/out/absent → CHECK_IN/CHECK_OUT/ABSENCE (/parent/attendance)`.
  - `FinancialEventConsumer (nursery-financial)`: `invoice.created/payment.received → INVOICE/PAYMENT (/parent/invoices)` + email.
  - `MessagingService.createMessage`: `tx notification.createMany(MESSAGE)` + outbox `chat.message.created + chat.notification.requested`.
- **Outbox:** `OutboxService.enqueue(topic,payload,tx?)` in business tx → `OutboxRelayService` → `KafkaProducerService` (idempotent) → consumers. Historical cutoff guard exists.
- **Socket:** `MessagingGateway /messaging` (`WsJwtGuard` JWT `tv+mustChangePassword`) joins `user:<id>` on connect via `trackSocket`; `CHAT_SERVER_EVENTS.NOTIFICATION="notification:new"` emitted per-recipient in `broadcastMessage` (payload `{conversationId,messageId}` only). Real-time exists **for chat only** — inbox notifications never pushed.
- **Portal:** `portal-workspace.tsx` has no bell/inbox; `ChatClient` listens `notification:new` only to `reload()` conversations.

## Gaps
1. **No read API:** no `GET /notifications`, `unread-count`, `PATCH :id/read`, `PATCH read-all`, no pagination/filter. Consumers write, nobody reads.
2. **No real-time inbox push:** new `Notification` rows not emitted to `user:<id>`; `notification:new` reused for chat only (different payload shape).
3. **No preferences/audit:** no prefs model; `AuditLog` only for business ops, not read actions (correct).

## Proposed design (no new model/consumer)
- **New `notifications/` module** (controller+service+repo-pattern, reusing `PrismaService`, `CurrentUser`, `normalizePage`): `GET /notifications?status=all|unread|read&type&page`, `GET /unread-count`, `PATCH :id/read`, `PATCH read-all` (idempotent, `userId` from JWT only, `404` if not owner).
- **Socket:** extend `MessagingGateway` with `broadcastNotification(userId, notification)` on `notification:new` (or new `notification:inbox` with full row) — persisted first, then emit; worker has no `Server` instance, so relay via `Redis` already used for `RedisIoAdapter` pub/sub (emit in API process after consumer writes? **worker process cannot emit** — needs `Redis.publish` + adapter listener, or HTTP outbox bridge. Simpler: **emit from API `NotificationsService` after DB write when called from API path**, and for Kafka-written rows, poll/emit via `OutboxRelay` → add `Redis`-backed emitter in worker (documented tradeoff; inbox still correct via REST on reconnect — source of truth is PG).
  - To keep scope small without new infra: REST inbox is source of truth; Socket is best-effort enhancement via `MessagingGateway.broadcastNotification` called from `NotificationsService` when available, skipped in worker (offline users get REST on reconnect). No duplicate DB rows from delivery.
- **Frontend:** `NotificationBell` + `notifications-manager.tsx` (inbox with filters/pagination/read-all) inside Parent Portal (and header for all portals, scoped by user).

## Security
- Ownership: `where {userId: user.id}` everywhere; `PATCH :id/read` → `updateMany {id,userId,readAt:null}` count-check → `404` if 0 (no leak). No body `userId`.
- Types from existing `NotificationType`; content already safe (no hashes/tokens/audit).

> Audit complete. No source modified except this doc.
