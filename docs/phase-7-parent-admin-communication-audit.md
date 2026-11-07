# Professional Notification System — Audit & Proposal (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only inspection · Status: **Parent exists, Admin has no producers**

## 1. Existing architecture (verified)

**Model (unchanged, no migration needed):** `Notification {id, userId FK cascade, type CHECK_IN|CHECK_OUT|ABSENCE|INVOICE|PAYMENT|MESSAGE|INCIDENT|ENROLLMENT|ACTIVITY|GENERAL, channel IN_APP|EMAIL, title, body, link?, readAt?, createdAt}` + `@@index[userId,readAt]`.

**Backend:**
- `NotificationsService/Controller/Module` exists (`GET /notifications?status&type&page`, `GET /unread-count`, `PATCH :id/read`, `PATCH /read-all`). Ownership strictly `where {userId: user.id}`; `markRead` `404` on foreign; `list` select safe fields (no `idDocument`/audit).
- **Outbox/Kafka (reuse):** `Business Tx → OutboxService.enqueue(topic,payload,tx) → OutboxRelayService (2s) → KafkaProducerService idempotent (key=eventId) → consumers deduped via `ProcessedEvent` + manual commit + DLQ`. No historical release.
- **Consumers already create `Notification`:** `NotificationEventConsumer (notification.requested→GENERAL, enrollment.approved/rejected→ENROLLMENT /parent/applications, incident→INCIDENT)`, `AttendanceEventConsumer (checked_in/out/absent → CHECK_* /parent/attendance, parentUserIds)`, `FinancialEventConsumer (invoice/payment → INVOICE/PAYMENT)`, `MessagingService → MESSAGE` (direct `createMany` + outbox `chat.*`). **Producer gaps:** no `child.enrolled/updated → notification`, no `activity.created → notification`, no admin-directed events (enrollment submitted/approved/rejected for admin, attendance unusual, meal recorded — no `parentUserIds`-like admin fan-out).
- **Socket:** `MessagingGateway /messaging` (`WsJwtGuard` JWT `sub+tv` + `mustChangePassword`), `RedisService` presence, `RedisIoAdapter` fan-out, rooms `user:<id>` (auth-only join) + `conversation:<id>`. `CHAT_SERVER_EVENTS.NOTIFICATION=notification:new` emitted in `broadcastMessage` (chat-shape `{conversationId,messageId}`) and `NotificationsService.notify()` (inbox-shape `{notification:{…}}`, best-effort, no-op without `Server` in worker).
- **AuthZ/RBAC:** `JwtAuthGuard (tv revoke, mustChangePassword)`, `RolesGuard`. Notifications have **no role gate** (any authenticated user sees own inbox `#7` pattern — must be verified).

**Frontend:**
- `components/notifications-inbox.tsx`: `NotificationBell` (unread badge + recent 3 hover preview, `useSocket` live, REST fallback) + `NotificationsInbox` (All/Unread/Read + category filters, pagination, `Mark read/all`, safe `Open` link, loading/empty/error, skeleton). Reuses `apiRequest (chatRequest, credentials:include, 401 refresh)`, Tailwind tokens, no Lucide (emoji 🔔 used).
- `portal-workspace.tsx`: `parent notifications` nav → `NotificationsInbox`; **Admin portal has no `notifications` section** (bell visible in header for all, but links to `/parent/notifications` always → 404 for admin role guard mismatch); no admin center page.

## 2. What is already implemented
- Persistent inbox + read/unread + unread-count for **any authenticated user** (parent in practice).
- Category filter (`type`), status filter, server pagination (`toPage`).
- Real-time best-effort via `notification:new` on `user:<id>` (PG truth, offline REST).
- Events: enrollment (parent), attendance (parent), finance (parent), message, incident.

## 3. Missing functionality
1. **Admin producers:** no `Notification` rows for admin trio (new application, approved/rejected, child archived/updated, classroom assign, unusual attendance, meal/activity create).
2. **Admin inbox UI:** no `/admin/notifications` route/section; bell points to parent path.
3. **ACTIVITY category:** `NotificationType.ACTIVITY` exists but **never written** (no `activity.created` consumer); `ActivityParticipation` not linked.
4. **Search (`q`) + priority:** inbox has category/status only; no title/body search, no priority field.
5. **Parent category `ACTIVITY/MEALS`:** no producer/consumer.
6. **Socket payload unification:** chat `notification:new {conversationId,messageId}` vs inbox `{notification:{…}}` — front tolerant but ambiguous.
7. **Tests:** service spec covers ownership; no admin matrix, no IDOR pagination, no socket isolation edge cases.

## 4. Security problems
- **IDOR (Low, already mitigated):** `markRead` correctly `404` on foreign, but `GET :id` style direct fetch not exposed (list only) — safe.
- **Over-scoping (Medium):** `GET /notifications` allows **any role** (`@ApiBearerAuth` only, no `@Roles`) — intended for Phase 7 parent-only, but admin sees empty inbox (no producers) rather than denied; risks leaking if admin pushes broad events later. Should gate by producer intent, not role list.
- **Payload sensitivity (Low):** `body` includes child/teacher names (existing consumer templates) — appropriate for parent, but admin copy must not include medical notes. Currently no admin copy exists to leak.
- **Bell link hardcodes `/parent/notifications`** → 403/404 for admin (correct denial, broken UX).

## 5. Required database changes
**None.** Existing `Notification` satisfies inbox; priority/search can be done UI-side/filter. No migration without explicit approval (per strict rules).

## 6. Recommended implementation plan
**P7.1 (backend, reuse):** Extend `NotificationEventConsumer`/`AttendanceEventConsumer`/new `AdminNotificationConsumer` (same group `nursery-notifications`, add topics `enrollment.* already`, `child.enrolled/updated`, `activity.created`, `meal.recorded` — require outbox enqueue in those services first!) — admin fan-out via `User where role in [SUPER,ADMIN,DIRECTOR]` (email-less in-app only). Add `Dedicated AdminNotificationService.notifyAdmins`.
**P7.2 (frontend unified):** Generalize `NotificationBell` href by `roleHome` (`/admin/notifications` vs `/parent/notifications`); add `admin notifications` section (reuse `NotificationsInbox` with `portal` prop, category search `q` filter for title/body).
**P7.3 (tests):** admin ownership/isolation, duplicate Kafka (`ProcessedEvent`), socket room isolation, offline persistence, UI bell/inbox states.
Each phase: API test → lint/tsc/build → web test → build. No email, no migration, no `down -v`, no outbox historical release.

> Audit complete. No source modified except this doc. Awaiting approval to proceed to implementation (P7.1).
