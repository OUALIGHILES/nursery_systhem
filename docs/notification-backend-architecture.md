# P7.R6 — New Notification Backend Architecture

Date: 2026-11-07 · P7.R6 only (no frontend built)

## Layout

```
apps/api/src/notifications/
  dto/inbox-query.dto.ts            # InboxQueryDto (status/type/q/page/pageSize) + NOTIFICATION_TYPES + ReadDto
  domain/category-mapper.ts         # isAdminEvent/topic->CategoryMapping (type/title/link) + composeAdminBody (safe fields)
  domain/recipient-policy.ts        # adminRecipientIds (SUPER_ADMIN/ADMIN/DIRECTOR active) + parentRecipientIds (payload only)
  repository/notification.repository.ts  # findPage (owner + status + type + q OR title/body), unreadCount, markRead 404, markAllRead
  delivery/delivery.service.ts      # best-effort gateway emit to user room; no-op when unavailable; never marks read
  notifications.service.ts          # facade: composes repo + delivery (list/unreadCount/markRead/markAllRead/notify)
  notifications.controller.ts       # same 4 routes: GET /notifications, GET /unread-count, PATCH /:id/read, PATCH /read-all (JWT @CurrentUser)
  notifications.module.ts           # MessagingModule + facade + repo + delivery
  *.spec.ts                         # replacement (5), repository (3), category-mapper (4), delivery (3), meal-producer (3)
apps/api/src/kafka/consumers.ts     # NotificationEventConsumer delegates to category-mapper + recipient-policy; topics += meal.recorded
apps/api/src/meals/meals.module.ts  # OutboxService injected; recordConsumption enqueues "meal.recorded" (safe fields, no notes)
```

## Flow

`Business Tx → outbox.enqueue (topic, safe payload) → relay (2s) → KafkaProducer (idempotent) → Consumer (ProcessedEvent dedupe + manual commit + DLQ) → prisma.notification.createMany/create → PG truth → DeliveryService best-effort Socket emit (notification:new on user:<id>) → REST read on reconnect.`

## Event matrix (verified)

EN profile: enrollment.submitted→admin trio (ENROLLMENT /admin/admissions); approved/rejected→parent by email (ENROLLMENT /parent/applications); child.enrolled/updated→admin (GENERAL); activity.created→admin (ACTIVITY); **meal.recorded→admin (GENERAL /admin/meals) — producer wired in MealsService.recordConsumption** (id/mealId/childId/mealType/consumption only); attendance triple→parentUserIds (CHECK_*/ /parent/attendance); invoice/payment→parentUserId (INVOICE/PAYMENT); chat.message.created→direct MESSAGE tx; incident→parentUserIds (INCIDENT); notification.requested→userId payload (GENERAL). `BaseEventConsumer` provides retry (3), backoff, DLQ (`.dlq`), historical cutoff — unchanged.

## Security

All API reads/writes where userId==JWT sub; markRead 404 (no leak); q/type validated (`MaxLength 100`, enum); select allowlist excludes secrets/medical notes; admin fan-out derives recipients from Role rows only; meal payload excludes free-text notes.

## Tests (actual)

- `apps/api npm test` → 28 files, 149 passed EXIT 0 (incl. repository 3, mapper 4, delivery 3, meal 3, replacement 5).
- `apps/web npm test` → 5 files, 20 passed EXIT 0 (chat unchanged, no chat edits).
- `lint EXIT 0`, `tsc EXIT 0`, `build EXIT 0` (api+web).

## Limitations

- No admin/parent frontend (R7/R8); old UI stays deleted.
- Delivery remains worker no-op (PG truth + REST).
- Parent ACTIVITY daily-report producer still absent (enum exists, no events) — future work.
