# Phase 2.3 — Pickup Management Security Audit

Date: 2026-11-07 (read-only inspection, no DB touched, no migration run)

## Scope inspected
- `apps/api/src/children/children.controller.ts` (pickup routes lines 80-88)
- `apps/api/src/children/children.service.ts` `addPickup`/`removePickup` (lines 170-186) + `get/profile/detail/CHILD_INCLUDE`
- `apps/api/src/children/dto.ts` `CreatePickupDto`
- `apps/api/src/common/access.service.ts` `assertChildAccess`
- `apps/api/src/common/guards/roles.guard.ts` `RolesGuard/isStaffRole`
- `apps/api/src/common/audit.service.ts`
- `apps/web/src/components/child-profile.tsx` (read-only pickup list, no mutations yet)

## Findings

### 1. Exact endpoints
- `POST /api/v1/children/:id/pickups` → `ChildrenController.addPickup` (**no `@Roles` decorator**). DTO: `CreatePickupDto { fullName: string(2-120), relation: string(2-60), phone: string(6-32), idDocument?: string(max120) }`. Returns `AuthorizedPickup` row (`id, childId, fullName, relation, phone, idDocument, isActive, createdAt, updatedAt`).
- `DELETE /api/v1/children/:id/pickups/:pickupId` → `removePickup` (**no `@Roles`**). No body. Returns `{ message: "Authorized pickup removed" }`. Soft-deactivates (`isActive=false`).

Contrast: `POST /children`, `PATCH :id`, `POST :id/archive`, `POST :id/classroom`, `POST :id/parents`, `DELETE :id/parents/:parentId` all carry `@Roles("SUPER_ADMIN","ADMIN","DIRECTOR")` (+ `DELETE :id` adds `SUPER_ADMIN/ADMIN`). Pickups intentionally omit `@Roles` — service enforces `assertChildAccess`.

### 2. Allowed roles (service-enforced, verified)
- **SUPER_ADMIN / ADMIN / DIRECTOR:** `AccessService.assertChildAccess` → `isStaffRole` true + not TEACHER/STAFF → `return` (unrestricted, see all children). **Allowed.**
- **TEACHER / STAFF:** `assertChildAccess` → child must exist, `classroomId` non-null, `ClassroomStaff` assignment for `staff.userId` on that classroom, else `404/403`. **Allowed only for assigned classrooms.** Can add/remove pickups for those children.
- **PARENT:** `assertChildAccess` → `ChildParent` link (`parent.userId` == actor) else `403 You do not have access to this child`. **Allowed only for linked children.** Can add/remove pickups for own children.
- **No `@Roles` fallback:** `RolesGuard` passes when no metadata (no restriction), then `JwtAuthGuard` (global) ensures authenticated. So design is `assertChildAccess`-only — **not** double-checked by `@Roles`.

### 3. Parent modification verified?
**Yes.** Parent with `ChildParent` link passes `assertChildAccess` for `addPickup`/`removePickup`. No `isStaffRole` gate in those two methods (unlike `update` which blocks non-staff). Intent appears to be “parents manage own pickups”. No check for `canPickup` flag in DTO/service: `ChildParent.canPickup` is stored but **never read** in `addPickup/removePickup` — a linked parent with `canPickup=false` can still modify pickups. This is the one semantic gap (see §7).

### 4. Child-access & ownership/link validation
- `addPickup`: `assertChildAccess(actor,id)` → `findFirst{id, deletedAt:null}` → `404` if missing → `create {childId:id, …}`. `childId` comes from URL, validated as UUID by Nest param + DTO.
- `removePickup`: `assertChildAccess(actor,id)` → `findFirst{id:pickupId, childId:id}` (scoped) → `404` if not found / cross-child → soft `update isActive=false`. **Scoped correctly** — cannot deactivate another child’s pickup by guessing `pickupId` alone.
- **Teacher isolation:** `assertChildAccess` requires `ClassroomStaff` link; `list()` pattern using `visibleChildIds` is consistent. No `classroomId` parameter is trusted from frontend for pickup ops — only `id/pickupId` UUIDs, then server checks.
- **IDOR:** Parent A guessing Parent B’s `childId` → `assertChildAccess` `403`. Teacher guessing out-of-classroom `childId` → `403`. Teacher guessing `pickupId` from other classroom → `findFirst {id, childId}` still requires `assert` on `childId` first → `403` before lookup. **No IDOR found** for pickup add/remove beyond the `canPickup` semantic (low).

### 5. Audit logging
- `addPickup`: `AuditService.log({actorId: actor.id, action:"child.pickup_added", entity:"AuthorizedPickup", entityId: pickup.id})` — **no metadata** (childId/file dropped). Verified present.
- `removePickup`: `audit.log({actorId, action:"child.pickup_removed", entity:"AuthorizedPickup", entityId: pickupId})` — **no metadata**.
- `AuditService.log` never throws (try/catch + `logger.error`), so business flow not blocked. No `ipAddress` passed (controller doesn’t forward `@Ip`), unlike some auth flows. Sufficient for tracing; childId recoverable via `pickup.childId` join.
- **Gap (non-blocking):** No `metadata: {childId}` — future audit queries must join `AuthorizedPickup`.

### 6. DTO validation & responses
- **Create:** `class-validator` (`@IsString/@Length/@MaxLength`), global `ValidationPipe {whitelist, transform, forbidNonWhitelisted}`. `fullName 2-120`, `relation 2-60`, `phone 6-32` (string, no format regex), `idDocument max120 optional`. No `childId` in body (URL-only). No enum for `relation` (free string, unlike `LinkParentDto`).
- **Remove:** no DTO. `pickupId` UUID param.
- **Errors:** `404 Child not found / Authorized pickup not found`, `403 You do not have access… / Child is outside your assigned classrooms`, `400 Validation failed` (Nest auto). Success shapes above.
- **Response data:** `addPickup` returns full row including `idDocument` — frontend must not log/render `idDocument` unnecessarily; keep display to `fullName/relation/phone/isActive` per plan.

### 7. Risks & required protections
| Risk | Severity | Verdict |
|---|---|---|
| **A. `canPickup=false` ignored** — linked parent with `canPickup=false` can still add/remove pickups | Low-Medium | **Document, do not fix in frontend.** Backend should check `ChildParent.canPickup` before mutation; frontend cannot know intent. Exposing controls to `canPickup=false` parent is currently backend-allowed, so UI gating by role alone would either over-hide (break legit parent flow) or over-show (if product expects `canPickup` to block). **Flag for separate backend fix; do not block Phase 2.3 UI** (backend wins, controls shown to linked parent, server would still allow — matches audit). |
| **B. No `@Roles` on pickup routes** | Low | By design (service covers). Frontend must still rely on `403` handling, not role sniffing. |
| **C. No rate-limit metadata** (`@Throttle` absent) | Low | Global `ThrottlerModule (100/min)` still applies via `ThrottlerGuard`. No per-route abuse risk beyond global. |
| **D. `phone` free format (6-32)** | Low | DTO validates length; frontend should mirror `minLength=6 maxLength=32`. |
| **E. List leaks?** `GET /children/:id` (`CHILD_INCLUDE`) returns `authorizedPickups {id,fullName,relation,phone}` to anyone passing `assert` — same set as `profile`. No leak beyond authorized. | Info | UI shows only active pickups (backend filters `isActive:true`) — inactive rows never returned; remove appears as disappearance (soft-delete). |
| **F. `Document.visibility` in `profile()`** (unrelated to pickup) | High (pre-existing) | No pickup UI impact. `profile.documents` returned without filter — **no pickup code touches documents**; Phase 2.3 must not render documents. Flagged separately. |

### Verdict
**Audit passes with no blocker.** Existing backend authorization is **sufficient and unambiguous** for pickup add/remove (linked parent + assigned teacher/staff + admin trio via `assertChildAccess` + scoped `pickupId` lookup + audit). No backend change required before frontend. Frontend must **not** treat role as auth; show mutation controls to all callers who passed `profile` `assert` (i.e., everyone who can see the profile), rely on `403` banner for denied, and hide nothing based on `canPickup` (backend gap A, deferred).

## Implementation contract (for Step 2)
- Reuse `POST /children/:id/pickups` + `DELETE /children/:id/pickups/:pickupId` via `apiRequest`.
- Frontend gating: render add/remove for **every** role that successfully loads `ChildProfile` (i.e., passed `assert`); on `403/404` show error and keep list read-only.
- Confirmation window before `DELETE`; per-row + form `loading` disable to prevent duplicates; refresh via `GET /children/:id` (+ `profile` for pickups) after success.
- Validation mirrors DTO: `fullName 2-120`, `relation 2-60`, `phone 6-32`, `idDocument 0-120 optional`.
