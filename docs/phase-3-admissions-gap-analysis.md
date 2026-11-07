# Phase 3 — Admissions & Enrollment Gap Analysis

Date: 2026-11-07 · Auditor: read-only inspection, no DB touched, no source modified (except this doc).

## 1. Executive Summary

Admissions is **backend-mature, frontend-cherry**: submission → review → child/enrollment/parent creation is transactionally sound with parallel-approval protection, duplicate-child guard, capacity `SELECT … FOR UPDATE`, idempotent claim via `updateMany {status != APPROVED}`, and dual notification (in-app + email via Kafka outbox). Admin review UI exists but is **thin** (list + modal, client-side filter only). Parent tracking UI **does not exist** (no `/parent/applications` route; consumer link 404s). Document upload is **explicitly deferred** (comment in service). No enrollment self-service after approval.

**Overall maturity: Backend 85%, Frontend 45%.**

## 2. Existing Backend Features

| Feature | Status | File / Endpoint | Service method | Tests |
|---|---|---|---|---|
| Public submission | **Implemented** | `enrollment.controller.ts POST /enrollment-applications` (`@Public`, `@Throttle 3/min`) | `EnrollmentService.submit(dto)` — validates DOB<now, start≥today, unique `reference LS-…`, audit `submitted` | Spec: submit validation (implicit via review tests + e2e) |
| Admin list/filter | **Implemented** | `GET /enrollment-applications` (`@Roles ADMIN trio`) → `?status=&q=&page=` | `list()` summary select, `OR reference/email/names` | Spec: review covered, list partially |
| Admin detail | **Implemented** | `GET /:id` | `get()` full `APPLICATION_SELECT` | — |
| Review non-approval (UNDER_REVIEW/INFO_REQUESTED/REJECTED) | **Implemented** | `PATCH /:id` same | atomic claim + `enrollment.rejected` outbox only for REJECTED (requires `adminNotes`) | Spec: rejection-reason, stale-race guard |
| Approve → Child+Enrollment+Links | **Implemented** | Same `PATCH` | classroom resolve (explicit match program+capacity else first active with space), tuition plan (explicit else cheapest active), duplicate-child fast + in-tx recheck, `User FOR UPDATE`, `Classroom FOR UPDATE`, capacity recheck, create `Child/ChildParent(isPrimary,canPickup=true)/Allergy(split ≤20)/Enrollment(ACTIVE)` + outbox `child.enrolled+enrollment.approved`, audit `approved` | Spec: happy path, capacity, no-classroom, incomplete, duplicate, rollback, concurrent locks, secret-leak |
| Parent account creation | **Implemented** | Same tx | resolve/create `User(PARENT, mustChangePassword:true, Argon2id temp `randomBytes(16).base64url+A1`)+`Parent` ; existing `PARENT` reused, non-PARENT email → `409`. Credentials `mail.send` post-commit, failure logged (not rollback) | Spec: creation + email-failure |
| Notifications | **Partial** | Outbox → Kafka | `EmailEventConsumer(enrollment.approved/rejected via MailService dry-run)`, `NotificationEventConsumer` (in-app `ENROLLMENT` link `/parent/applications`) | `consumers.spec.ts` |
| Throttling | Implemented | `@Throttle 3/min` POST | — | — |

## 3. Existing Frontend Features

| Feature | Status | Component | Connected API | Missing UI |
|---|---|---|---|---|
| Public submission (6-step wizard) | **Implemented** | `components/admissions-form.tsx` (Parent/Child/Program/Emergency/Documents/Review) | `POST /enrollment-applications` → reference/status | Documents step is informational only (no upload control); no duplicate-email pre-check; `childGender` defaults |
| Admin list + review modal | **Partial** | `portal-workspace.tsx admissions` (list `endpoint` + `openReview/saveReview` + `classroomOptions/planOptions`) | `GET /enrollment-applications`, `GET /:id`, `PATCH /:id`, `GET /classrooms`, `GET /billing/plans` | Search is client-side `includes`; **no server `?q`/`?status` filter UI**; no pagination UI (fixed 50); classrooms filtered by `program` UI-side only; tuition plan select shown only when `APPROVED`; no enrollment/child link display after approve except notice |
| Parent view of own applications | **Missing** | — | No `Parent` query API (`list` requires `@Roles ADMIN trio` + no `parentEmail` filter for self) | No `/parent/applications` page; consumer link `/parent/applications` → wildcard `[section]` renders `applications` → `!section → Page not found`. User cannot track status. |
| Status badges/page | Partial | Admission table `status` column plain | — | No badge styling, no counts, no empty/error state beyond generic |

## 4. Database and Business Logic

**Models:** `EnrollmentApplication(standalone, no FK to User; indexes status/parentEmail/createdAt)`, `Child 1:N Enrollment CASCADE`, `ChildParent composite`, `Allergy`, `Classroom`, `TuitionPlan`, `Notification`, `AuditLog`, `OutboxEvent`, `ProcessedEvent`.

**Flow:** `POST` → `PENDING` → `PATCH UNDER_REVIEW/INFO_REQUESTED/REJECTED/APPROVED` → `APPROVED` claim (`updateMany !APPROVED`) → create `Child(ACTIVE) → ChildParent → Allergy → Enrollment(ACTIVE, plan?)` → outbox → consumers → audit. All inside `$transaction` (single tx, row locks `User` + `Classroom`, capacity recheck). Duplicate: `(first/last/DOB/email)` fast + in-tx; enrollment uniqueness via claim-only (no `@unique` on Enrollment, relies on tx).

**Constraints verified:** `Classroom.name@unique`, `TuitionPlan.name@unique`, `User.email@unique`, `EnrollmentApplication.reference@unique`. No FK from Application → User (privacy + reuse).

## 5. Security Findings

**Confirmed:**
- **High — Parent tracking IDOR gap (by omission):** `GET /:id` requires `@Roles ADMIN trio`; parent has no way to list own applications → forced to guess UUID → `403`. Correct denial, but no legitimate path — parents blind post-submit (mitigated only by email).
- **Medium — Public PII enumeration:** `POST /enrollment-applications` is `@Public` w/ throttle 3/min, accepts any `parentEmail`. No CAPTCHA/turnstile, no dedupe (spam enqueues `PENDING` rows). Rate-limit only.
- **Medium — `GET /classrooms` unscoped:** returns all classrooms to any authenticated user incl. `PARENT` (used by admin review modal, leaks names/programs). Filter should be admin-only or assigned-only.
- **Low — Email failure hides credentials:** if `mail.send` throws post-commit, approval succeeds silently (`logger.error` only). Parent must call support (no retry outbox for credentials).

**Theoretical (not confirmed):** duplicate `reference` collision (UUID+timestamp, negligible); `requestedStartDate` time-zone skew (uses `toDateString` local); `allergies` free-text to `Allergy` without severity choice (defaults `MODERATE`).

## 6. Test Coverage

**Existing (`enrollment.service.spec.ts`, 15 cases):** approve happy path, parent creation + credentials email, capacity, no-classroom, incomplete, duplicate-approve, duplicate-child, rollback, rejection-reason + atomic outbox, stale-race, non-admin 403 pre-DB, `FOR UPDATE` lock order, secret not in response/audit/outbox, email-failure, 404.

**Missing:** submit validation/duplicate-POST, `list ?status?q` + pagination, `GET :id` 404/403, concurrent-classroom capacity race (e2e), existing non-`PARENT` email 409, allergy split edge cases, frontend modal validation/refresh.

## 7. Gap Matrix

| Feature | Backend | Frontend | Tests | Status | Priority |
|---|---|---|---|---|---|
| Public submission | ✅ | ✅ wizard | ⚠️ partial | Implemented | — |
| Admin list/detail | ✅ | ⚠️ table+modal | ⚠️ partial | Partial | P2 (filter UI) |
| Admin review (approve/reject) | ✅ | ✅ modal | ✅ | Implemented | — |
| Classroom/tuition select | ✅ auto+explicit | ✅ modal | ✅ | Implemented | — |
| Parent self-service view | ❌ | ❌ | ❌ | Missing | **P0** |
| Document upload | ❌ (deferred by design) | ❌ informational | ❌ | Missing (by design) | P3 |
| Notifications (in-app+email) | ✅ consumers | ❌ no inbox | ✅ consumers | Partial | P1 |
| Duplicate/spam guard | ⚠️ throttle only | ❌ | ❌ | Partial | P2 |
| Enrollment lifecycle (end/withdraw) | ❌ (`endDate/status` unused) | ❌ | ❌ | Missing | P3 |
| Classroom list authZ | ⚠️ unscoped | ⚠️ | ❌ | Partial | **P1** |
| Audit/outbox | ✅ | — | ✅ | Implemented | — |

## 8. Recommended Implementation Roadmap

### Phase 3.1 — Parent self-service (highest value, small)
- **Scope:** `GET /enrollment-applications?parentEmail=self` (or dedicated `/my-applications`) reusing `list()` with `parentUserIds` scoping + parent portal `applications` section (read-only table + status badge). No approve/reject.
- **Reuse:** `EnrollmentService.list` summary select, `PortalWorkspace` generic table, `AccessService`.
- **Missing:** backend self-filter + UI page.
- **Files:** `enrollment.controller/service/dto`, `portal-workspace.tsx parentSections`, `AccessService` (add `parentApplications` scope).
- **Security:** parent sees only `parentEmail == me.email`; teacher/staff 403.
- **Acceptance:** parent lists own PENDING→APPROVED/REJECTED, cannot see others (403), admin list unchanged.

### Phase 3.2 — Admin filter/search hardening
- **Scope:** wire `?status` + `?q` controls (server pagination) into admin admissions; fix classroom picker to admin-only endpoint (or new `GET /classrooms/active`); badge styling.
- **Reuse:** existing `QueryEnrollmentApplicationsDto`.
- **Files:** `portal-workspace.tsx` only (no backend).
- **Security:** filter params validated already (`@IsIn/@MaxLength`).
- **Acceptance:** filter round-trips server pagination; unscoped classroom options not shown to parent.

### Phase 3.3 — Credential reliability (small)
- **Scope:** move parent credentials into outbox (`enrollment.credentials` topic) so retry via existing Kafka, instead of fire-and-forget `mail.send`.
- **Reuse:** `OutboxService`, `MailService`, `EmailEventConsumer`.
- **Missing:** new topic + consumer template.
- **Files:** `kafka/topics.ts`, `consumers.ts`, `enrollment.service.ts` (enqueue vs direct).
- **Security:** temp password never in outbox/audit (hash-only pattern already proven).
- **Acceptance:** email failure → DLQ/retry, not silent loss.

### Phase 3.4 — Enrollment lifecycle + Document flow (deferrable)
- **Scope:** `Enrollment.endDate/status` UI + `PATCH /enrollments/:id` (none exists); secure document upload (`Document` + `StorageService` + `visibility`).
- **Requires approval** (schema/controller decisions, `Document.visibility` fix prerequisite).
- **Do not start** until 3.1–3.3 complete.

> Audit complete 2026-11-07. No source, schema, or data modified.
