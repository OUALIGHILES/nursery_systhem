# Phase 2.4 — Child Management Backend Audit (READ-ONLY)

Date: 2026-11-07 · Auditor: read-only inspection · Status: **PASS with 1 scoped gap (no blocker)**

## Endpoints inspected

| Method | Route | Roles (`@Roles`) | DTO validation | Child-access check | Classroom check | Audit | Tx/outbox |
|---|---|---|---|---|---|---|---|
| `PATCH` | `/children/:id` | `SUPER_ADMIN,ADMIN,DIRECTOR` | `UpdateChildDto` all optional: `firstName/lastName 2-80, dateOfBirth DateString, gender, classroomId UUID\|null, medicalNotes max4000\|null, bloodType max8\|null, status ACTIVE\|ARCHIVED` | **No `assertChildAccess`** — relies on `@Roles`. Service checks `404` + `isStaffRole` (redundant, teacher/staff never reach due `@Roles`). **Gap:** no classroom scoping beyond `@Roles` (but `TEACHER/STAFF` blocked at controller, so OK) | `assertClassroomCapacity` if `classroomId` changes (active + count < capacity, `BadRequest` if full) | `child.updated` | `$transaction(update + outbox child.updated)` |
| `POST` | `/children/:id/archive` | `ADMIN trio` | — | No `assert` (covered by `@Roles`) | — | `child.archived` | direct update (no outbox) |
| `DELETE` | `/children/:id` | `SUPER_ADMIN,ADMIN` | — | No `assert` (covered by `@Roles`) | — | `child.deleted` soft (`deletedAt,status=ARCHIVED`) | direct update |
| `POST` | `/children/:id/classroom` | `ADMIN trio` | `AssignClassroomDto{classroomId?:UUID\|null}` | No `assert` | `assertClassroomCapacity` (404 if missing/inactive, 400 if full) | `child.classroom_assigned + metadata{classroomId}` | direct update → `get()` |
| `POST` | `/children/:id/parents` | `ADMIN trio` | `LinkParentDto{parentId UUID, relation, isPrimary?, canPickup?}` | No `assert` | — | `child.parent_linked + metadata{parentId}` | `$transaction(clear primary + create)` — 409 if duplicate |
| `DELETE` | `/children/:id/parents/:parentId` | `ADMIN trio` | — | No `assert` | — | `child.parent_unlinked + metadata{parentId}` | `delete ChildParent` only — **parent account intact** (no `User`/`Parent` delete) |
| `POST/DELETE` | `/children/:id/pickups` | — (service `assert`) | `CreatePickupDto` | `assertChildAccess` | — | `pickup_added/removed + metadata{childId}` | direct |

## Security verification

- **Parent cannot edit:** `PATCH` `@Roles ADMIN trio` → `403 Inadequate permissions` before service. Parent `list/get/profile/pickups` via `assertChildAccess → ChildParent` link else `403 You do not have access`. **PASS.**
- **Teacher/Staff cannot modify:** Same `@Roles` guard blocks `PATCH/classroom/parents/archive/delete`. Service `isStaffRole` is dead code for teacher/staff via controller (intended defense-in-depth mismatch, not a vuln). Teacher can only `list/get/profile/pickups` via assigned-classroom `assert`. **PASS.**
- **Teacher cannot assign arbitrary classroom:** `assignClassroom` blocked by `@Roles`; frontend must not call it for teacher. Backend capacity check prevents overflow. Classroom options for admin (unscoped list) vs teacher (must derive from `GET /children`) — enforced client-side only, server is authority. **PASS.**
- **Parent link/unlink:** `link/unlink` blocked by `@Roles`; parent cannot touch `ChildParent`. Duplicate link → `409 Parent already linked`. Primary: `updateMany isPrimary=false` then create. **PASS.**
- **Inaccessible classroom via manipulation:** `assertClassroomCapacity` checks `isActive` + capacity; `404 Classroom not found` if inactive/missing. `update.classroomId=null` allowed (unassign). **PASS.**
- **Unlink safety:** `delete ChildParent` only; `Parent`/`User` rows untouched. **PASS.**
- **Access/restrictions intact:** `visibleChildIds` (admin=all, teacher/staff=assigned, parent=linked) + `assertChildAccess` on read paths. **PASS.**

## Identified gap (scoped, no blocker for Phase 2.4)

- `update/archive/remove/assignClassroom/linkParent/unlinkParent` rely **solely** on `@Roles` + `404` without `assertChildAccess`. Since `@Roles` restricts to admin trio who bypass `assert` anyway, this is **not a vuln** — but `update` service `isStaffRole` check is misleading dead code (teacher blocked earlier). Frontend must hide all mutations for non-admin; backend `@Roles` remains authoritative. No change required for Phase 2.4 scope (would be defense-in-depth only).
- `GET /classrooms` returns all classrooms to any staff/parent — classroom picker for admin is fine, but **teacher/parent UIs must derive options from `GET /children`** (attendance/child-manager pattern). No backend blocker.

**Verdict:** All 5 required endpoints exist, DTOs validated, audit logged, transactions/outbox where needed, authorization sufficient. **Proceed to implementation.**
