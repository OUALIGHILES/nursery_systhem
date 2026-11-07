# Phase 3.1 — Parent Self-Service: My Applications

## Endpoint
`GET /api/v1/enrollment-applications/my-applications` — `@Roles("PARENT")`, authenticated only.

**Identity:** derived exclusively from `@CurrentUser() user.email` (lowercased/trimmed in service). No query/body `parentId/userId/email` accepted; `QueryEnrollmentApplicationsDto` only allows `status/page/pageSize` (extra `q` ignored vs template? `q` present but scoped query ignores it to prevent IDOR/search leak — only `status` honored).

**Response:** paginated (`toPage`, `normalizePage` 1–100) ordered `createdAt desc`:
```json
{
  "items": [{
    "id": "uuid",
    "reference": "LS-…",
    "childFirstName": "A",
    "childLastName": "B",
    "requestedProgram": "TODDLERS",
    "requestedStartDate": "2026-…",
    "status": "PENDING|UNDER_REVIEW|INFO_REQUESTED|APPROVED|REJECTED",
    "createdAt": "…",
    "adminNotes": "reason or null"
  }],
  "total": 1, "page": 1, "pageSize": 20, "totalPages": 1
}
```
`adminNotes` only when `status==REJECTED` (rejection reason intended for parent). No `parentEmail/phone/address/medicalNotes/allergies/auditId` returned.

**Security:**
- `PARENT` only (`@Roles("PARENT")` + `JwtAuthGuard`); admin/teacher → `403`; unauth → `401`.
- `where.parentEmail == user.email` (derived, lowercased) → parent cannot see others; no IDOR via query (no `parentId` param).
- Pagination same as admin `list`.

## Frontend
- `portal-workspace.tsx parentSections.applications`: `endpoint /enrollment-applications/my-applications?page=1&pageSize=50`, columns `reference/childFirst/last/program/start/status/createdAt`, added to `navByPortal.parent` after `children`. Reuses generic table/search/refresh/empty/loading/error. No review controls (admin `admissions` modal unchanged).

## Tests
- `enrollment-my-applications.spec.ts`: own-scope + lowercase + `adminNotes` masking, empty list, status filter → **3 passed**.
- Quality gates (actual): see final report.

## Files
- `apps/api/src/enrollment/enrollment.controller.ts` (+ myApplications route)
- `apps/api/src/enrollment/enrollment.service.ts` (+ myApplications)
- `apps/api/src/enrollment/enrollment-my-applications.spec.ts`
- `apps/web/src/components/portal-workspace.tsx` (parent section + nav)

## Limitations
- `q` search not exposed to parent (prevents cross-family search); status filter only.
- Parent cannot view detail (`GET :id` still admin-only) — tracking is list-only per scope.
- Email change after approval orphans old applications (schema has no User FK by design).
