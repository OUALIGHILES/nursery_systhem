# Notification System — Full Inventory (P7.R1)

Date: 2026-11-07 · Status: **Inventory only — no code deleted/modified yet**

## 1. Database (schema.prisma)

| Structure | Detail |
|---|---|
| `enum NotificationChannel` | `IN_APP`, `EMAIL` |
| `enum NotificationType` | `CHECK_IN`, `CHECK_OUT`, `ABSENCE`, `INVOICE`, `PAYMENT`, `MESSAGE`, `INCIDENT`, `ENROLLMENT`, `ACTIVITY`, `GENERAL` |
| `model Notification` | `id uuid PK`, `userId String FK→User Cascade`, `type NotificationType=GENERAL`, `channel=IN_APP`, `title`, `body`, `link?`, `readAt?`, `createdAt now()`, `@@index[userId, readAt]` — **remains untouched** |
| `model OutboxEvent` | `eventId unique`, `topic`, `payload Json`, `status PENDING/PROCESSING/PUBLISHED/FAILED`, `attempts`, `nextRetryAt`, `@@index[status,nextRetryAt]` — shared infra, **preserved** |
| `model ProcessedEvent` | `eventId unique`, `consumerGroup`, `@@index[consumerGroup]` — idempotency, **preserved** |

## 2. Backend

| File | Notification role |
|---|---|
| `apps/api/src/notifications/notifications.controller.ts` | `GET /notifications?status&type&page&pageSize`, `GET /unread-count`, `PATCH :id/read`, `PATCH /read-all` — ownership `userId=user.id`, `404` on foreign, `InboxQueryDto`/`ReadDto` (no `q`) |
| `apps/api/src/notifications/notifications.service.ts` | `list/unreadCount/markRead/markAllRead` + `notify()` best-effort `gateway.server.to(userRoom(userId)).emit(notification:new)` (no-op without `Server`) |
| `apps/api/src/notifications/notifications.module.ts` | `MessagingModule` import, exports `NotificationsService` |
| `apps/api/src/notifications/notifications.service.spec.ts` | 5 unit tests (scope, unread+type, count, markRead 404, markAll) |
| `apps/api/src/kafka/consumers.ts` | `NotificationEventConsumer (nursery-notifications)`: `notification.requested→GENERAL`, `enrollment.approved/rejected→ENROLLMENT /parent/applications`, `incident→INCIDENT`, P7.1 fan-out `enrollment.submitted/child.enrolled/child.updated/activity.created/meal.recorded→admin trio (SUPER_ADMIN/ADMIN/DIRECTOR)`; `AttendanceEventConsumer (nursery-attendance)`: `checked_in/out/absent→CHECK_*`; `FinancialEventConsumer`: `invoice/payment→INVOICE/PAYMENT`; helpers `notifyUsers()` |
| `apps/api/src/kafka/topics.ts` | 17 topics incl. `notification.requested`, `chat.notification.requested`, `enrollment.submitted`, `meal.recorded`; groups `NOTIFICATIONS=nursery-notifications`, `EMAIL`, `ATTENDANCE`, `FINANCIAL`, `AUDIT` |
| `apps/api/src/kafka/base-consumer.ts` | `BaseEventConsumer`, `ProcessedEvent` dedupe + manual commit + DLQ — shared, **preserved** |
| `apps/api/src/kafka/consumers.spec.ts` | covers `notification.requested` + rejection topic |
| `apps/api/src/messaging/messaging.events.ts` | `CHAT_SERVER_EVENTS.NOTIFICATION='notification:new'`, `userRoom=id→user:<id>` |
| `apps/api/src/messaging/messaging.gateway.ts` | `/messaging` namespace, `WsJwtGuard` (JWT `tv+mustChangePassword`), joins `user:<id>` on connect/refresh, `broadcastMessage` emits chat-shape `{conversationId,messageId}` on same `notification:new` name |
| `apps/api/src/messaging/messaging.service.ts:454-475` | `tx.notification.createMany(MESSAGE)` + outbox `chat.message.created + chat.notification.requested` |
| `apps/api/src/worker/worker.module.ts`, `worker.service.ts` | registers `NotificationEventConsumer` etc. |
| `apps/api/src/app.module.ts:26,52` | imports `NotificationsModule` |
| `apps/api/src/outbox/outbox.service.ts`, `outbox-relay.service.ts` | `enqueue(topic,payload,tx?)` → relay 2s → idempotent producer — shared, **preserved** |
| `apps/api/src/common/access.service.ts` | `assertChildAccess/visibleChildIds` — shared, **preserved** |
| `apps/api/src/meals/meals.module.ts`, `enrollment.service.ts`, `activities` | `meal.recorded` / `enrollment.submitted` outbox enqueues (P7.1) — shared business logic, **preserved** |

## 3. Frontend

| File | Notification role |
|---|---|
| `apps/web/src/components/notifications-inbox.tsx` | `NotificationBell` (emoji 🔔, badge, hover preview, **hardcoded `href="/parent/notifications"`** ×2) + `NotificationsInbox` (status/category filters, pagination, mark read/all, `Open` raw `link`, socket `notification:new` listen) |
| `apps/web/src/components/portal-workspace.tsx` | imports both (`:12`), header `<NotificationBell />` no-prop (`:550`), `parentSections.notifications` (`:169`) only — **no `adminSections.notifications` / `navByPortal.admin` entry**, `sectionHref()` builds `/${portal}/${key}`, `rolesByPortal` guard bounces admin off `/parent/*` → `roleHome` |
| `apps/web/src/app/chat/socket-events.ts` | `CHAT_SERVER_EVENTS.NOTIFICATION='notification:new'` |
| `apps/web/src/app/chat/hooks/use-socket.ts` | singleton `io(/messaging, credentials:include, reconnection:Infinity)`, auth-error refresh — shared, **preserved** |
| `apps/web/src/app/chat/chat-client.tsx` | listens `notification:new` to `reload()` conversations (chat-shape) |
| `apps/web/src/app/chat/chat-api.ts` | `apiRequest` wrapper (`credentials:include`, 401 refresh) — shared, **preserved** |
| `apps/web/src/app/admin/[section]/page.tsx`, `parent/[section]/page.tsx` | dynamic routes render `PortalWorkspace` for any `section` string |
| No dedicated `useNotifications` hook / Redux / store / CSS file — logic lives inline in the two components above. No `notifications-inbox.test.*`. |

## 4. Shared infrastructure (MUST PRESERVE)

`OutboxEvent`/`ProcessedEvent` tables, `OutboxService`+relay, `KafkaProducerService`, `BaseEventConsumer`, `RedisService` + `RedisIoAdapter`, `WsJwtGuard`, `MessagingGateway` transport, `User/Child/Classroom` domain, all `KAFKA.TOPICS` values (additive only), `app.module.ts` wiring for non-notification modules.

**Cross-portal link guard:** frontend rewrites/strips `link` whose prefix doesn't match the viewer's portal (`/parent/*` for Parent, `/admin/*` for Admin), falling back to the portal's notifications root when mismatch — defense in depth behind backend role-scoped writers.

## Front-pressure note on link display
`portal-workspace.tsx`'s generic CRUD render also prints raw `link` values through `pretty()` — once `NotificationCenter` replaces that render branch for `sectionName === "notifications"`, no raw URLs reach generic tables.

---

# Deletion Plan (P7.R2)

## Files to DELETE (notification-specific only)
- `apps/web/src/components/notifications-inbox.tsx` — **entire file** (bell + inbox replaced from scratch; new components in `components/notifications/*`).
- `apps/api/src/notifications/notifications.service.spec.ts` — tests for removed service surface (rewritten as new backend tests in P7.R6).

## Files to REPLACE (same path, new content)
- `apps/api/src/notifications/notifications.controller.ts` — expanded DTOs (`q`, `type` enum validation, `portal`-neutral), same routes.
- `apps/api/src/notifications/notifications.service.ts` — repository-style split (`NotificationRepository`, `NotificationDeliveryService`), `q` search, stronger idempotency.
- `apps/api/src/notifications/notifications.module.ts` — rewire to new sub-providers.
- `apps/web/src/components/portal-workspace.tsx` — bell gets `portal` prop; `adminSections.notifications` + `navByPortal.admin` added; render new center instead of generic table.

## Files to PRESERVE (shared — edit only notification-specific lines)
- `apps/api/src/kafka/consumers.ts` — **do NOT delete** (also handles enrollment/attendance/finance/incident business events). Only reshapes `NotificationEventConsumer` internals in P7.R6; `notifyUsers()` moved to new repository, `Attendance`/`Financial` consumers untouched.
- `apps/api/src/messaging/*` — **preserve transport**; only rename/alias `CHAT_SERVER_EVENTS.NOTIFICATION` payload so chat `{conversationId,messageId}` vs inbox `{notification}` can't collide (tolerant handler + new `notification:inbox` alias if approved).
- `apps/web/src/app/chat/hooks/use-socket.ts`, `chat-client.tsx`, `chat-api.ts`, `socket-events.ts` — **preserve** (shared with chat); notification bell reuses `useSocket` as-is.
- All Outbox/Kafka/Redis/Prisma infra — untouched.

## Old tests to remove
Only `notifications.service.spec.ts` (replaced). No other notification-only specs exist; `consumers.spec.ts`/`worker.service.spec.ts` cover shared paths and are kept.

## Risks
- **No record loss:** `Notification` rows + `ProcessedEvent` + `OutboxEvent` are never touched; consumers keep consuming same topics (idempotent `ProcessedEvent` prevents duplicates across the swap).
- **Socket name collision:** today both chat (`{conversationId,messageId}`) and inbox (`{notification}`) share `notification:new` — new frontend handlers must tolerate both shapes (dedupe by `notification.id` when present, ignore otherwise) until the alias is cut over; short-term tolerant handling avoids breaking chat.
- **Worker `Server` absent:** `notify()` no-op in worker process remains (PG truth + REST fallback) — same contract as today.
- **Route bounce:** deletion removes the Parent-only hardcode entirely; new bell derives `/${portal}/notifications` from session role before first render, eliminating the `PortalWorkspace` role-guard redirect.

---

# New System Design (P7.R3)

## Backend domains (separation of concerns)

```
apps/api/src/notifications/
  dto/           inbox-query.dto.ts (q, status, type[], page), mark-read.dto.ts
  repository/    notification.repository.ts (findPage, count, unreadCount, markRead, markAllRead)
                 — all predicates `where {userId}`; select safe fields; `OR title/body contains q`
  delivery/      delivery.service.ts (post-persist emit via optional MessagingGateway, tolerant)
  domain/        recipient-policy.service.ts (parentUserIds vs adminTrio, safe-field allowlist)
                 category-mapper.ts (event topic → NotificationType + portal prefix)
  consumers/     notification-event.consumer.ts (only notification.requested + enrollment/child/activity/meal/incident)
                 admin-fanout.consumer.ts (new — isolated group, only admin-directed topics)
  notifications.api.controller.ts  (same 4 routes)
  notifications.service.ts         (facade: compose repo + delivery; <100 LOC)
```

Flow: `Business Tx → OutboxService.enqueue → relay → KafkaProducer → EventConsumer → ProcessedEvent dedupe → NotificationRepository.createMany → PG (source of truth) → DeliveryService best-effort Socket emit → REST read on reconnect.`

## Frontend domains

```
apps/web/src/components/notifications/
  NotificationBell.tsx      (props: portal "admin"|"parent", sessionRole; roleHome derivation, Lucide Bell,
                             click dropdown + Esc, badge, per-row mark-read, View all)
  NotificationCard.tsx      (icon by NotificationType, unread dot, relative time, Open link)
  FilterBar.tsx             (segmented All/Unread/Read, category select portal-specific, search input)
  StatsBar.tsx              (Total/Unread/Read chips + Mark all)
  DetailDrawer.tsx          (slide-over title/body/category/date + role-safe link)
  EmptyState.tsx / Skeleton.tsx / ErrorState.tsx
  hooks/useNotifications.ts (server state: list, unread, filters, pagination, optimistic markRead;
                             socket subscription with id dedupe + reconnect REST refresh)
  lib/categoryMeta.ts       (type → Lucide icon, label, portal prefix "/admin|/parent")
  lib/relativeTime.ts       (Intl.RelativeTimeFormat helper)
apps/web/src/app/admin/notifications/page.tsx  → <NotificationCenter portal="admin" />
apps/web/src/app/parent/notifications/page.tsx → <NotificationCenter portal="parent" />
```

`NotificationCenter` is a client component mounted via dynamic `[section]` route (backward compatible): `portal-workspace.tsx` keeps `notifications` in both sections/nav maps but renders `NotificationCenter` instead of generic CRUD rows.

### Admin UI (proposed)
Light enterprise surface, 3-column stats, segmented filter, category select (Enrollment, Children, Attendance, Activities, Meals, Finance, General — only backend-supported), search, card rows, detail drawer with `/admin/admissions|children|activities` links, pagination, skeleton/empty/error states.

### Parent UI (proposed)
Warm family surface, same components/copy swap: categories (Enrollment, Attendance, Messages, Finance, General), links `/parent/applications|attendance|invoices`, trustworthy microcopy, same detail drawer, responsive sheet on mobile.

### Migration & removal risks
- **Zero table migration** — reuse `Notification`/`OutboxEvent`/`ProcessedEvent` as-is; no `prisma migrate`, no volume ops. Frontend deletes are file-local so rollback is `git restore` if needed (no data change).
- **Behavior risk is UI-only:** bell/inbox replacement does not change queue/topics; tolerant socket handler prevents chat regression.

---

# Mandatory Safeguards (pre-P7.R4 update)

## 1. Chat system protection

- **Transport preserved:** `MessagingGateway` (`/messaging`, `WsJwtGuard`), `RedisIoAdapter`, `user:<id>` + `conversation:<id>` rooms, `use-socket.ts` singleton, and `chat-client.tsx` `notification:new` listener are **never modified** in this replacement.
- **Payload contract frozen:** inbox emits already carry `{notification:{id,type,title,body,link,createdAt}}`; chat emits `{conversationId,messageId}` on the **same** `notification:new` name. The new `useNotifications` hook must:
  1. ignore payloads without `notification.id` (chat payloads pass through silently),
  2. dedupe on `notification.id` (prevent double-count on reconnect/replay),
  3. never call `socket.off("notification:new")` in a way that unsubscribes chat listeners (each component registers its own anonymous handler; cleanup removes only its own).
- **Compatibility test (P7.R10, before any deletion):** run chat send/receive + notification send concurrently; assert: message appears in conversation, inbox badge increments once, no `notification:new` handler errors, existing `hook onNotif tolerates both shapes` behavior verified.

## 2. Historical data compatibility

- **No schema change:** `Notification` model, `NotificationType` enum (10 values), `User` relation (`onDelete: Cascade`), `OutboxEvent`, `ProcessedEvent` tables are untouched — **no migration proposed**.
- **Records preserved:** all `Notification` rows (title/body/link/readAt/createdAt/userId) remain readable by the new `NotificationRepository` (identical `select` set); backfill is a non-issue because fields are identical.
- **Idempotency parity:** consumers keep consuming the same 17 topics via the same `ProcessedEvent` + `eventId` dedupe, so a `/admin/notifications` reload after replacement shows identical history with correct `readAt` states.

## 3. Test replacement ordering (no gap)

P7.R5 deletion is gated on P7.R6 test creation:

| Step | Action | Gate |
|---|---|---|
| T1 | Write `notifications.repository.spec.ts` + `delivery.service.spec.ts` + `notifications.api.controller.spec.ts` against the **new** (not-yet-deleted) module facade; keep `notifications.service.spec.ts` | must pass |
| T2 | Write `components/notifications/*.test.tsx` (bell href by role, dropdown Esc, badge, filters, mark-read, link prefix) | must pass |
| T3 | Run `npm test` (api) + `npm test` (web) | both EXIT:0 |
| T4 | Only then delete `notifications.service.spec.ts` (replaced) and `notifications-inbox.tsx` | per P7.R4 approval |

No existing test is removed before its replacement is green.

## 4. Complete event matrix (producer → topic → consumer → recipient)

| # | Business event | Producer (enqueues outbox) | Topic | Consumer (group) | Recipient policy | `NotificationType` | Link |
|---|---|---|---|---|---|---|---|
| E1 | Enrollment submitted | `EnrollmentService.submit` (`enrollment.service.ts:117`) | `enrollment.submitted` | `NotificationEventConsumer` (`nursery-notifications`) P7.1 fan-out | admins trio (`role IN SUPER_ADMIN/ADMIN/DIRECTOR`, `isActive`, `deletedAt null`) | `ENROLLMENT` | `/admin/admissions` |
| E2 | Enrollment approved | `EnrollmentService.review` (`enrollment.service.ts:521`, inside approval tx) | `enrollment.approved` | `NotificationEventConsumer` + `EmailEventConsumer` | parent `User` by `parentEmail` (`findUnique email`) | `ENROLLMENT` | `/parent/applications` |
| E3 | Enrollment rejected | `EnrollmentService.review` (`:238`, non-approval tx) | `enrollment.rejected` | same pair | parent by `parentEmail` | `ENROLLMENT` | `/parent/applications` |
| E4 | Child enrolled | `ChildrenService.create` (`children.service.ts:83`) + `EnrollmentService.review` approval tx (`:516`) | `child.enrolled` | `NotificationEventConsumer` P7.1 fan-out | admin trio | `GENERAL` | `/admin/children` |
| E5 | Child updated | `ChildrenService.update` (`:111`) | `child.updated` | `NotificationEventConsumer` P7.1 fan-out | admin trio | `GENERAL` | `/admin/children` |
| E6 | Activity created | `ActivitiesService.create` (`activities.module.ts:188`) | `activity.created` | `NotificationEventConsumer` P7.1 fan-out | admin trio | `ACTIVITY` | `/admin/activities` |
| E7 | Meal recorded | **Producer missing** — `MealsService` has no `OutboxService` dep; no `outbox.enqueue("meal.recorded")` anywhere | `meal.recorded` (topic declared, no producer) | `NotificationEventConsumer` P7.1 branch (guards `if (!p.id) return`) | admin trio (dead path today) | `GENERAL` | (null) |
| E8 | Attendance checked-in | `AttendanceService.checkIn` (`attendance.service.ts:52`) | `attendance.checked_in` | `AttendanceEventConsumer` (`nursery-attendance`) | `parentUserIds` from event payload | `CHECK_IN` | `/parent/attendance` |
| E9 | Attendance checked-out | `AttendanceService.checkOut` (`:85`) | `attendance.checked_out` | same | `parentUserIds` | `CHECK_OUT` | `/parent/attendance` |
| E10 | Attendance absent | `AttendanceService.markAbsent` (`:114`) | `attendance.absent` | same | `parentUserIds` | `ABSENCE` | `/parent/attendance` |
| E11 | Invoice created | `BillingService` (`billing.module.ts:228`) | `invoice.created` | `FinancialEventConsumer` (`nursery-financial`) | `parentUserId` (direct `create`) | `INVOICE` | `/parent/invoices` |
| E12 | Payment received | `BillingService` (`billing.module.ts:302`) | `payment.received` | same | `parentUserId` | `PAYMENT` | `/parent/invoices` |
| E13 | Message created | `MessagingService.createMessage` (`messaging.service.ts:463-475`) | `chat.message.created` + `chat.notification.requested` | direct `tx.notification.createMany(MESSAGE)` in producer tx (no consumer delay) | conversation participants via `conversationId` | `MESSAGE` | `/chat?conversation=<id>` |
| E14 | Incident reported | `HealthService` (`health.module.ts:219`) | `incident.reported` | `NotificationEventConsumer` (`notifyUsers`) | `parentUserIds` | `INCIDENT` | `/parent` |
| E15 | Generic notification | any future producer | `notification.requested` | `NotificationEventConsumer` + `EmailEventConsumer` (parallel) | `userId` from payload (server-set only) | `GENERAL` | payload `link` or null |

**Gaps (do not mark implemented):**
- **E7 `meal.recorded` / `ACTIVITY` for meals:** topic exists, consumer branch exists, **no producer** — admin meal fan-out never fires today. P7.R6 must wire `OutboxService` into `MealsService.recordConsumption` (or accept the gap) before claiming E7 implemented.
- **Parent `ACTIVITY`/`GENERAL` daily-report notifications:** no producer emits activity/meal content to parents; parent `ACTIVITY` enum value exists but is never written.
- **`type` filter completeness:** frontend `type` select lists all 10 enum values; only the subset with producers (E1–E15 above) will ever show rows.

## 5. Safe removal + final deletion checklist

| File | Action | Notification-specific? | Shared deps preserved |
|---|---|---|---|
| `apps/web/src/components/notifications-inbox.tsx` | **DELETE** (after T1–T3 green) | Yes — entire file is bell+inbox | None shared; `apiRequest`/`useSocket` imports stay in new code |
| `apps/api/src/notifications/notifications.service.spec.ts` | **DELETE** (replaced by repository/delivery/controller specs) | Yes | None |
| `apps/api/src/notifications/notifications.controller.ts` | **REPLACE** (DTO `q`, enum validation) | Yes | Same 4 routes, same JWT guards |
| `apps/api/src/notifications/notifications.service.ts` | **REPLACE** (facade → repository+delivery) | Yes | Same Prisma queries/`notify()` semantics |
| `apps/api/src/notifications/notifications.module.ts` | **REPLACE** (new sub-providers) | Yes | `MessagingModule` import kept |
| `apps/web/src/components/portal-workspace.tsx` | **EDIT** (bell `portal` prop, `adminSections.notifications`, `navByPortal.admin`, render branch) | Partial | All generic CRUD, auth guard, `roleHome` map preserved |
| `apps/api/src/kafka/consumers.ts` | **EDIT** (reshape `NotificationEventConsumer` internals; `notifyUsers` → repository) | Partial | `Audit/Attendance/Financial/Email` consumers, `ALL_TOPICS` subscriptions preserved |
| `apps/api/src/messaging/*`, `app/chat/*`, Outbox/Kafka/Redis/Prisma | **PRESERVE** — no edit | No | — |

---

# P7.R4 + P7.R5 — Actual Removal Results (2026-11-07)

## Execution order (as approved)
1. **Tests first:** Created `apps/api/src/notifications/notifications.replacement.spec.ts` (5 tests: list scoping, unread+type filter, unread count, markRead 404, markAll) + `apps/web/src/components/notifications-replacement.test.ts` (4 tests: `notification:new` export, `roleHome` map, role-aware routes, chat/inbox payload coexistence). Both passed **before** deletion (`api 5 passed`, `web 4 passed`).
2. **Deletion:** Deleted `apps/web/src/components/notifications-inbox.tsx` (bell + inbox) and `apps/api/src/notifications/notifications.service.spec.ts` (old spec). Edited `portal-workspace.tsx`: removed `NotificationBell/NotificationsInbox` import, `<NotificationBell />` header mount, `parentSections.notifications`, `navByPortal.parent` entry, `sectionName === "notifications"` render branch + refresh guard. Verified zero remaining refs (`Select-String notifications-inbox|NotificationBell` → none in `components/*.tsx` except test).
3. **Preserved:** `Notification` table + all `NotificationType` values + `readAt` history, `OutboxEvent`/`ProcessedEvent`, all 17 Kafka topics + `BaseEventConsumer`/relay/producer, Redis + `RedisIoAdapter` + `MessagingGateway` transport, all `app/chat/*` files (chat `notification:new` listener untouched), enrollment/attendance/finance/activities/meals services + consumers (unchanged `NotificationEventConsumer`/`AttendanceEventConsumer`/`FinancialEventConsumer` still write via `prisma.notification` and are covered by existing `consumers.spec.ts`/`worker.service.spec.ts`), `app.module.ts` `NotificationsModule` wiring (backend API retained for P7.R6 rebuild — no broken imports).

## Verification (actual commands, EXIT codes)
- `apps/api npm test` → **24 files, 136 tests passed, EXIT 0** (includes replacement spec 5/5).
- `apps/web npm test` → **5 files, 20 tests passed, EXIT 0** (includes replacement test 4/4).
- `apps/api npm run lint` → **EXIT 0** (warnings only, pre-existing). `apps/web npm run lint` → **12 warnings, 0 errors, EXIT 0**.
- `npx tsc --noEmit` api → **EXIT 0**. web → **EXIT 0**.
- `npm run build` api (`nest build`) → **EXIT 0**. web (`next build`) → **EXIT 0**.
- No broken imports; no routing regressions for existing portals (chat, children, attendance, messages, admissions all unchanged; only `/parent/notifications` bell/inbox are gone until P7.R7/R8).

## Remaining limitations / deferred to P7.R6
- Backend `notifications.service/controller/module` + `NotificationEventConsumer` fan-out were **not** replaced in this step (preserved to keep replacement tests green and avoid breaking P7.1 writers that use `prisma.notification` directly). The full repository/delivery split, `q` search, and admin-fanout consumer isolation are P7.R6 scope per the strict boundary.
- `/parent/notifications` and `/admin/notifications` routes no longer render an inbox (nav entries removed); this is the intentional checkpoint state — new UI arrives in P7.R7/R8.
- `meal.recorded` still has **no producer** (see §4 E7) — wiring it remains P7.R6 work; do not claim it implemented.

---

# P7.R6 — New Backend Built (2026-11-07)

Implemented per `docs/notification-backend-architecture.md`: dto/domain/repository/delivery/facade/controller/module; `NotificationEventConsumer` delegates to `category-mapper` + `recipient-policy` and subscribes to `meal.recorded`; `MealsService.recordConsumption` now enqueues `meal.recorded` (safe fields only); `q` search (`OR title/body contains`, no migration, `MaxLength 100`). All gates green (api 149 passed, web 20 passed, lint/tsc/build EXIT 0). No frontend built, no chat edits, no migration. See architecture doc for event matrix and remaining limits.



**Global invariants for P7.R5:** no migration, no `docker compose down -v`, no volume deletes, no `Notification`/`OutboxEvent`/`ProcessedEvent` row deletes, no Outbox replay, no deploy, no external mail — same subject as the safety rules in the brief.


