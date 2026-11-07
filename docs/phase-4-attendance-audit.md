# Phase 4 — Attendance Audit (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only inspection · Status: **Already implemented — no new models/endpoints required**

## What exists (verified)

**Prisma:** `Attendance {id, childId Cascade, date @db.Date, status PRESENT|LATE|ABSENT|EXCUSED, checkInAt?, checkOutAt?, checkedInById? SetNull, checkedOutById? SetNull, pickedUpById?, notes?}` + `@@unique[childId,date]` (duplicate prevention DB-level) + `@@index[date,status]`. `Child 1:N Attendance`, `User 1:N CheckedInBy/OutBy`.

**Backend `AttendanceController` (`@ApiBearerAuth`, `/attendance`):**
- `POST /check-in` → `checkIn(dto)` staff only (`isStaffRole`) + `assertChildAccess` + active child + `LATE_AFTER 09:30` logic + `$transaction(findUnique childId_date → 400 if checkInAt, else update/create)` + `outbox attendance.checked_in` + `audit checked_in`.
- `POST /check-out` → same + `pickupId` verified (`AuthorizedPickup active for child`) + requires `checkInAt` + `checkedOutAt` guard + outbox `checked_out` + audit.
- `POST /absent` (`MarkAbsentDto{childId, date?, reason?, status ABSENT|EXCUSED}`) — parent **allowed** (`isParent || isStaffRole`) + `assertChildAccess` + `upsert childId_date` + outbox `absent` + audit.
- `GET /` (`QueryAttendanceDto{date,classroomId,childId,status,page,pageSize}`) → `visibleChildIds` scope + `childId` IDOR check + classroom filter + paginated `toPage(serialize detailed)`.
- `GET /calendar?month&childId?` (validated `YYYY-MM`, visible-scope), `GET /report?from&to&classroomId&childId` (groupBy status + rate), `GET /child/:childId` (history 100).

**Frontend:** `components/attendance-manager.tsx` wired in `portal-workspace.tsx` for `admin/parent/staff/teacher attendance` sections: date/classroom/child selectors (classrooms derived from accessible `/children`, never `/classrooms`), daily roster with `NOT_MARKED` fallback, status pills, `check-in/out/absent` (staff/admin only), parent read-only, admin `report+calendar`, loading/error/empty, refresh.

**Outbox/Kafka:** `KAFKA.TOPICS` includes `attendance.checked_in/out_of_scope?` — checked topics: `checked_in, checked_out, absent`; consumers write `Notification` + `AuditLog` (read-only audit, no real email in tests).

**AuthZ pattern:** `JwtAuthGuard (tv/mustChangePassword)` + `AccessService.assertChildAccess` (admin=all, teacher/staff=assigned classroom, parent=linked) + `visibleChildIds` + service `isStaffRole` for writes. Matches proposed matrix (view-all admin only, assigned-staff scoped).

## Gaps vs requirements

| Req | Status |
|---|---|
| Daily select classroom/date, view children, present/absent/late/excused, arrival/departure, notes | **Implemented** (notes via DTO, no UI note field — minor) |
| Check-in/out state machine | **Implemented** (dup guards, pickup verify, server timestamps, actor from JWT) |
| Parent history | **Implemented** (linked only, read-only) |
| History filter/pagination | **Implemented** (`date/classroomId/childId/status/page`, `report/calendar`) |
| `GET /attendance/daily/summary/my-children` proposed names | **N/A** — existing `GET / + list` covers; renaming would break `AttendanceManager` |
| Schema change/migration | **None needed** — `@@unique` exists |

## Risks
- **Low:** `list()` returns `child.classroomId` (not name) + `notes` visible to parent for own child (note is `reason` for absent — intended). No `checkedInBy` name leak beyond `checkedInBy/OutBy` first/last (already in profile reads).
- **Low:** `checkIn` uses local `getHours` for `LATE` (server TZ) — documented, no frontend timestamps trusted (requirement met).

## Plan
No new backend. Frontend already complete. If further work: add note input to `MarkAbsent` + `check-in/out` notes field — **out of scope for this audit** (no schema change).

> Audit complete 2026-11-07. No source/schema/data modified (except this doc).
