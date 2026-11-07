# Phase 5 — Daily Activities & Meals Management

Date: 2026-11-07 · Stack: NestJS12/Prisma7/Next16/React19 · Status: Implemented, no migration

## Architecture (existing, reused)
- **Activities:** `Activity{title,description,scheduledAt,durationMin,classroomId,createdById}` + `ActivityParticipation@@unique[activityId,childId] (PARTICIPATED|PARTIAL|NOT_PARTICIPATED|ABSENT)`. `GET /activities?classroomId&date&page`, `GET /:id` (now scoped), `POST/PATCH/DELETE :id` (roles), `POST :id/participations` upsert. `outbox activity.created` + audit `created/updated/deleted`.
- **Meals:** `Meal{date,mealType BREAKFAST|LUNCH|SNACK_MORNING|SNACK_AFTERNOON,name,description,allergens[],classroomId} @@unique[date,mealType,classroomId]` + `MealRecord@@unique[mealId,childId] (ALL|PARTIAL|NONE)`. `GET /meals?date&classroomId`, `POST/PATCH/DELETE`, `POST :id/records` (staff+assert), `GET :id/records`, `GET child/:childId` (assert). Audit only, no outbox.
- **Health:** `Allergy{allergen,severity}` + `profile()` aggregation reused by UI.

## API changes
- `ActivitiesService.get(id,user)`: parent sees only `classroomId in visibleChildIds` classrooms else `404`; controller passes `user`; `POST/PATCH @Roles` now includes `STAFF` (was TEACHER-only).
- `MealsService.list/records`: now take `user` and scope by `visibleChildIds` (admin=all, else linked/assigned `classroomId in allowed`); parent/global leak removed. `MealsController list/records` pass `user`.

## Frontend
- `components/daily-report.tsx` (`DailyReport({portal})`): child/date selectors (children from `GET /children` scoped), `GET /activities?date`, `GET /meals?date`, `GET /meals/child/:id`, `GET /health/allergies?childId` → allergy banner + meal `ALLERGY CHECK` flag (string match, UI warning only, no auto-allow). Parent read-only; staff/admin add activity `POST /activities` + add meal `POST /meals` + consumption `POST /meals/:id/records ALL|PARTIAL|NONE`. All states loading/error/empty, refresh.
- `portal-workspace.tsx`: `parent daily {"Daily Reports"}`, `staff/teacher daily {"Daily Activities & Meals"}` + nav; `daily` renders `<DailyReport>` (bypasses generic table).

## Authorization matrix (backend enforced)
| Op | Admin | Teacher/Staff (assigned) | Parent (linked) |
|---|---|---|---|
| View activities | all | assigned (list parent-scope, `get` scoped) | linked classrooms only |
| Create/edit activity | yes | yes (roles incl STAFF) | 403 |
| Delete activity | Admin trio | 403 | 403 |
| View meals/records | all | assigned | linked only (now scoped) |
| Create/edit meal + record consumption | yes | yes (`assert`) | 403 |
| Delete meal | Admin trio | 403 | 403 |

## Allergy
Warning only; no food declared safe; no medical mutation; `assertChildAccess` on history; meal allergen vs child allergy string match in UI.

## Tests (actual)
- `api: npm test` → see final report; `web: npm test` etc.

## Limitations
- No new category enum (free-text `title`); no `DINNER/MORNING_SNACK` or `NOT_EATEN` levels (existing `BREAKFAST/LUNCH/SNACK_*/ALL/PARTIAL/NONE` kept, no migration); no `activity.updated/meal.recorded` Kafka topics (reuse `activity.created` only); no `daily-reports` parent endpoint — uses existing `profile+meals+activities` composition.
