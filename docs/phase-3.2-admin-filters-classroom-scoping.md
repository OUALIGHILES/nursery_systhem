# Phase 3.2 — Admin Filters & Classroom Scoping

Date: 2026-11-07 · Auditor: read-only inspection then implementation.

## Audit findings
- `QueryEnrollmentApplicationsDto`: `status? @IsIn STATUSES`, `q? max120`, `page/pageSize (1-100)` → `normalizePage` + Prisma `where {status, OR reference/email/first/last/child}` + `toPage{items,total,page,pageSize,totalPages}`. Backend already correct.
- Frontend admin table used hardcoded `endpoint "/enrollment-applications?page=1&pageSize=50"` + client `JSON.includes` search, no status filter, no pagination → not server-side.
- `GET /classrooms`: controller allowed `isStaffRole||PARENT` then `service.list()` unscoped (all classrooms with teacher counts). **Leaked global list to parents.** Consumers: admin review modal (`portal-workspace openReview` fetches `GET /classrooms` + `GET /billing/plans`), admin `classrooms` section (`/classrooms`), dashboard counts. Public admissions form does **not** need classrooms (program only, auto-select backend). No public-safe mechanism needed.

## Implemented backend changes
- `ClassroomsService.list(user?)`: admin trio → all; `TEACHER/STAFF` → `where id in ClassroomStaff.assignments`; `PARENT` → `where id in ChildParent.child.classroomId` (linked only). Controller passes `user`.
- `ClassroomsService.get(id,user?)`: after 404 check, teacher/staff requires assignment else `404 Classroom not found`; parent requires `ChildParent` link to that classroom else `404`.
- Admissions: **no backend change** (dto/service already correct); pagination metadata already via `toPage`.

### Classroom matrix (backend enforced)
| Role | `GET /classrooms` list | `GET /classrooms/:id` |
|---|---|---|
| `SUPER_ADMIN/ADMIN/DIRECTOR` | all | all |
| `TEACHER/STAFF` | assigned only | assigned only |
| `PARENT` | linked children's classrooms only | linked only |
| Unauth | `401` (`JwtAuthGuard`) | `401` |

## Frontend changes (`portal-workspace.tsx`)
- Admin `admissions`: builds `?page&pageSize=20&status& q` server query (`refresh` depends on `admissionsStatus/admissionsPage/search`), `filteredRows=rows` for admin-admissions (no client filter), status `<select>` + pagination Previous/Next + `total/totalPages`. Resets `page=1` on filter/search change (handled in `onChange`).
- Parent `applications` unchanged (`/my-applications`, parent-only endpoint preserved).
- Review modal still uses `GET /classrooms` (admin sees all; teachers/parents not affected as modal is admin-only).

## Security decisions
- Classroom identity derived from JWT (`@CurrentUser`), never query/role params.
- `q` server search constrained to existing `OR` fields; `status` validated `@IsIn`.
- No sensitive fields added; no `adminNotes` to parent beyond REJECTED (3.1 preserved).
- No schema/migration.

## Tests & gates
- `classrooms-scoping.spec.ts`: admin all, teacher assigned, parent linked, unassigned 404 → PASS.
- `enrollment-my-applications.spec.ts` preserved → PASS.
- See final report for gate exit codes.

## Files modified
- `apps/api/src/classrooms/classrooms.service.ts`, `classrooms.controller.ts`
- `apps/api/src/classrooms/classrooms-scoping.spec.ts`
- `apps/web/src/components/portal-workspace.tsx`
- `docs/phase-3.2-admin-filters-classroom-scoping.md`

## Remaining limitations
- Classroom `q` filter not implemented (name filter via existing list only).
- Admission `q` searches parent/child names/email/reference (existing OR, no fuzzy beyond `contains`).
- Parent cannot request classroom name for unassigned (by design).
