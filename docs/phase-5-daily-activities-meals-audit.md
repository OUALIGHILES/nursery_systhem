# Phase 5 — Daily Activities & Meals Audit (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only · Status: **Backend mostly exists, no new schema required**

## What already exists (verified in source)

### Activities — `activities.module.ts` (monolith: DTOs+Service+Controller+Module)
- `Activity {id, title, description?, scheduledAt?, durationMin?, classroomId? SetNull, ledByStaffId?, createdById?}` + `ActivityParticipation @@unique[activityId,childId]` (`PARTICIPATED|PARTIAL|NOT_PARTICIPATED|ABSENT`).
- `GET /activities?classroomId&date&page` — staff: all; parent: classroom filter from `visibleChildIds` children (linked), else empty. Includes `classroom{name}, _count.participations`. `GET /:id` → classroom + participations (no access check! any authenticated can fetch any activity by id — IDOR gap, low: title/desc only).
- `POST /activities` `@Roles SUPER_ADMIN/ADMIN/DIRECTOR/TEACHER` → transaction + `outbox activity.created` + audit. `PATCH/DELETE` `@Roles ADMIN trio` + audit (delete hard, `cascade` participations).
- `POST /:id/participations` staff-only + `assertChildAccess(child)` → `upsert activityId_childId` (multiple/day allowed via separate activity rows). **No category field** — categories not in schema; `title/description` free text only. No `EDUCATIONAL/CREATIVE…` enum exists.

### Meals — `meals.module.ts`
- `Meal {id, date @db.Date, mealType BREAKFAST|LUNCH|SNACK_MORNING|SNACK_AFTERNOON, name, description?, allergens String[], classroomId?} @@unique[date,mealType,classroomId]` + `MealRecord @@unique[mealId,childId]` (`ALL|PARTIAL|NONE`).
- `GET /meals?date&classroomId` (no access scope — controller has no `@Roles`, service `list(query)` ignores user → **parent can list all dates/classrooms**). `POST/PATCH` `@Roles staff incl. TEACHER/STAFF`, `DELETE` `@Roles ADMIN trio` (hard delete). `POST /:id/records` staff-only + `assertChildAccess` → upsert; `GET /:id/records` **no access check** (any auth can see all records for meal); `GET /child/:childId` requires `assert`.
- Meal types: **no DINNER, no MORNING_SNACK split** (only `SNACK_*`). Consumption: **3 levels only** (no `NOT_RECORDED/NOT_EATEN/MOSTLY*`).

### Children profile / Daily report
- `GET /children/:id/profile` already aggregates `mealRecords(60)+participations(60)+attendances(60)` + allergies/meds/incidents. Parent portal has **no Daily Reports section** (uses `portal-workspace` generic `meals` table `?date=today` only, no child selector, no timeline).

### Allergy
- `Allergy {allergen, severity MILD|MODERATE|SEVERE, notes}` + `Meal.allergens String[]`. No cross-check service; `recordConsumption` does not compare `meal.allergens vs child allergies` — UI warning only (no backend enforcement).
- `GET /health/allergies?childId` exists (assert). `profile` returns `allergies` vetted by `assert`.

### Outbox/Audit
- Outbox topics: `activity.created` (activity), attendance `checked_in/out/absent` (parent notifications). **No** `activity.updated/meal.recorded/meal.updated` topics. Meals write has **no outbox** (audit `meal.created/updated/deleted` only). Activities audited; meals audited.
- `Notification` consumers handle attendance/incident/enrollment/finance — not activities/meals.

## Frontend
- Admin/Staff/Teacher `portal-workspace`: `activities (list+create 3-field)`, `meals (list+create 4-field)` generic tables.
- Parent: `meals (read-only list)`, **no activities UI** (backend supports parent classroom filter, UI missing).
- `AttendanceManager` pattern (children→classrooms derive) reusable.

## Authorisation vs proposed matrix

| Op | Admin/Director | Teacher/Staff | Parent | Existing |
|---|---|---|---|---|
| View activities | ✅ | ✅ | ✅ classroom-scoped | ✅ |
| Create activity | ✅ | ✅ TEACHER (STAFF excluded! `STAFF` missing from `@Roles` — gap) | ❌ | ✅ except STAFF create blocked |
| Edit/Delete activity | ✅ | ❌ (only ADMIN) | ❌ | ✅ matches “admin only delete” |
| View meals | ✅ | ✅ | ✅ (over-broad) | ⚠️ parent unscoped |
| Create meal | ✅ | ✅ | ❌ | ✅ |
| Record consumption | ✅ | ✅ `assert` | ❌ | ✅ |
| Delete meal | ✅ | ❌ | ❌ | ✅ |

**Gaps requiring fix (no schema change):**
1. `STAFF` cannot `POST /activities` (missing from `@Roles`) — intended per matrix STAFF should create. Add `STAFF` to create roles.
2. `MealsService.list/records` no scoping — add `user` param + `visibleChildIds` (like activities) to prevent parent global leak.
3. `ActivitiesController.get` no `assert` — scope by classroom visibility (parent) / assignment (teacher).
4. No category enum — keep `title/description` (no migration); UI can prefix categories as free text.
5. No `DINNER/NOT_EATEN` etc. — keep existing enums (no migration); UI maps `ALL→FULLY, PARTIAL→PARTIALLY, NONE→NOT_EATEN` labels.

## Proposed plan (no new modules/schema)
- Backend: add `STAFF` to `ActivitiesController POST @Roles`; scope `MealsService.list/records` by `visibleChildIds`; scope `ActivitiesService.get` by visibility.
- Frontend: `activities-manager.tsx` + `meals-manager.tsx` + `daily-report.tsx` (reuse `AttendanceManager`/`ChildManager` patterns: children derive, date/classroom selectors, parent read-only timeline from `profile + /meals + /activities`).
- Tests for matrix + allergy warning.

> Audit complete. No source modified (except this doc). Awaiting approval to implement.
