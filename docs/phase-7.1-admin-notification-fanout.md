# Phase 7.1 — Admin Notification Fan-out

Date: 2026-11-07 · Scope: backend only, no frontend, no migration

## Event flows (reused)
- `Business Tx → OutboxService.enqueue → OutboxRelay (2s) → KafkaProducer (idempotent) → NotificationEventConsumer (deduped via ProcessedEvent) → Notification.createMany (admin trio) → Socket best-effort (PG truth)`.

## Implemented
- `enrollment.submitted` (new topic): `EnrollmentService.submit` now `outbox.enqueue("enrollment.submitted",{id,reference,parentEmail,childName})` (no PII beyond reference/email/name).
- `NotificationEventConsumer` extended topics: `enrollment.submitted, child.enrolled, child.updated, activity.created, meal.recorded` → fan-out `user.findMany{role in SUPER_ADMIN/ADMIN/DIRECTOR, isActive, deletedAt:null}` → `createMany` (`ENROLLMENT/ACTIVITY/GENERAL`, links `/admin/admissions|children|activities`, body safe fields only).
- `activity.created` already in outbox (ActivitiesService); `meal.recorded` topic added, producer documented as future (no outbox in MealsService to avoid new dep — consumer handles if payload arrives, body generic).
- **Parent behavior preserved:** `notification.requested`/`enrollment.approved|rejected`/`incident`/`attendance.*`/`invoice/payment` paths untouched; admin fan-out `return`s early, never touches `parentUserIds`.

## Recipients (backend-derived, no client IDs)
`User where role in SUPER_ADMIN/ADMIN/DIRECTOR and isActive/deletedAt null` — derived from `RoleName`, not request. `skipDuplicates:true` + consumer `ProcessedEvent` dedupe prevents retries duplicating.

## Tests
- `consumers.spec` 4 passed; full `api test` 136 passed; `lint EXIT:0`, `tsc EXIT:0`, `build EXIT:0`.

## Limits
- Meal fan-out producer not wired (OutboxService not injected in MealsService to avoid module churn; consumer handles if queued). Activity/child/enrollment fan-out live.
- No admin inbox UI (P7.2).
