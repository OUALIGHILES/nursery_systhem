# Phase 2.5 — Child Lifecycle Audit (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only inspection · Status: **Archive SAFE, Restore NOT SUPPORTED**

## Endpoints inspected
- `ChildrenController` — `POST :id/archive` (`@Roles ADMIN trio`), `DELETE :id` (`@Roles SUPER_ADMIN/ADMIN`), `GET /`, `GET :id`, `GET :id/profile`, `PATCH :id`, `POST :id/classroom` (see `docs/phase-2.4-child-management-audit.md` for full matrix).
- `ChildrenService.archive/remove/update/list/get/profile/assertClassroomCapacity`
- `AccessService.assertChildAccess/visibleChildIds` (`admin=all, teacher/staff=assigned, parent=linked`)
- `Child` schema: `status ACTIVE|ARCHIVED` + `deletedAt` (soft-delete flag, separate from status). All relations (`ChildParent, AuthorizedPickup, Attendance, MealRecord, ActivityParticipation, Allergy, MedicationRecord, Incident, Document, Enrollment, Invoice via Parent`) use `onDelete:Cascade/SetNull` but **no code path deletes children**, so history untouched.

## Findings (numbered per STEP 1)

1. **DELETE is soft delete, not hard.** `remove(id)`: `findFirst{id,deletedAt:null}` → `404` → `update {deletedAt:now, status:ARCHIVED}` → `audit child.deleted` → `{message:"Child deleted"}`. No `prisma.child.delete`. `DELETE /children/:id` is **not** a hard delete and must not be exposed as “Delete” UI.
2. **Archive fields:** `archive(id)`: `findFirst{deletedAt:null}` → `404` → `update {status:ARCHIVED}` (single column). `deletedAt` untouched (stays null). Idempotent: second call sees `deletedAt=null` + `status=ARCHIVED`, update is no-op `ARCHIVED` again → safe (no error, no duplicate audit spam beyond 2nd log). No classroom unassign, no parent unlink, no status transition guard.
3. **Who can archive:** `POST :id/archive` `@Roles SUPER_ADMIN/ADMIN/DIRECTOR` (controller). Service has **no `assertChildAccess`** (covered by `@Roles`; admin bypasses it anyway). `TEACHER/STAFF/PARENT` → `403 Inadequate permissions` at `RolesGuard`. **PASS.**
4. **Archived excluded from lists?** `list()`: `where {id in visibleIds, deletedAt:null, [classroomId, status]}`. Without `status` param → **all** `deletedAt=null` (ACTIVE+ARCHIVED) — archived **included**; with `?status=ACTIVE` → ACTIVE only; `?status=ARCHIVED` → ARCHIVED only. `visibleChildIds` splits: admin=all, teacher=assigned (archived children still counted if assigned? `visibleChildIds` queries `classroomStaff→children` without `status` filter, so archived in assigned classroom still visible to teacher list — must not expose to teacher UI). `GET /children?status=ARCHIVED` is supported via `QueryChildrenDto.status` `@IsIn ACTIVE|ARCHIVED`.
5. **Archived access:** `get/profile` do `assertChildAccess` + `findFirst{deletedAt:null}` (status ignored) → **archived still readable** to authorized users (1:1 with parent/teacher scoping). `assertClassroomCapacity` counts only `status=ACTIVE` → archiving frees capacity. `PATCH` allowed on archived (no status guard).
6. **Restore NOT supported.** No `POST restore`, no `status=ACTIVE` endpoint. Closest is `PATCH /children/:id {status:ACTIVE}` (`UpdateChildDto.status`) — but `PATCH` is `@Roles ADMIN trio` and does **not** check `deletedAt`? It does `findFirst{deletedAt:null}` (archived passes) then `update {status}` + `child.updated` outbox. So a restore **could** be done via `PATCH status:ACTIVE` today, but that also re-enables classroom capacity (needs `assertClassroomCapacity` — `PATCH` already checks if `classroomId` changes, not for status-only restore, so restored child could exceed capacity). **No dedicated restore endpoint exists** — cannot implement safe restore UI without new endpoint + capacity check. **Document as gap.**
7. **Enrollments/classrooms:** `archive()` does **not** touch `Enrollment` (`childId Cascade` on delete, but archive is not delete), does **not** null `classroomId`. Archived child keeps `classroomId` + `Enrollment(status ACTIVE)` orphaned (still ACTIVE in DB). No `endDate` set. History preserved by design (update only).
8. **Historical records:** `Attendance/MealRecord/Participation/MedicationRecord/Incident/ParentLinks/Pickups/Document/Enrollment/Billing/AuditLog` untouched by archive/delete code paths (no cascade triggered because no hard delete). `profile()` still returns them post-archive (backend reads unaffected). **PASS** — verify via test (archive does not call child sub-deletes).
9. **Audit/outbox:** `archive` → `audit child.archived` only, **no outbox event** (no `child.archived` Kafka topic in `KAFKA.TOPICS`). `remove` → `child.deleted` only. `update` → `child.updated` outbox. Archive is **not** evented to notifications — intentional gap (no fan-out).
10. **Repeated archive/restore:** Archive idempotent (always `200 {message:"Child archived"}`, no `400`). Restore via `PATCH status:ACTIVE` idempotent but re-fires `child.updated`. No optimistic-lock versioning; concurrent archive+restore last-write-wins (single Prisma update atomic per call).

## Security verification

- Parent `POST archive` → `403` (`@Roles`). Parent `GET ?status=ARCHIVED` → `list` scopes by `visibleChildIds` (linked only) → cannot see other families’ archived. **PASS**, but teacher `visibleChildIds` ignores status → teacher listing archived via `?status=ARCHIVED` would succeed backend-side (service allows). Frontend must hide archived filter for non-admin; backend gap flagged: `list` does not forbid archived for teacher/parent.
- Teacher/staff `archive` → `403`. **PASS.**
- Unlinked parent `GET archived child` → `403` via `assert`. **PASS.**
- `DELETE` permanent UI: none (correct — would still be soft, but UX implies deletion; use archive instead).

## Verdict
**Archive safe to implement.** Restore **not** implementable without new endpoint — document, do not invent. Phase 2.5 ships archive + archived filter (admin-only management, backend-scoped list) only.

## Implementation contract (for STEP 2/3)
- Reuse `POST /children/:id/archive` (admin) + `GET /children?status=ARCHIVED` (with existing `q/classroomId/page`).
- Archived filter in `ChildManager`: status dropdown already exists — add `ARCHIVED` option, but gate management buttons to `isAdmin` only; backend `visibleChildIds` still protects teacher/parent (no new backend auth change in this phase).
- No `DELETE` button, no restore button.
- Confirmation dialog must state “not permanent deletion”.
