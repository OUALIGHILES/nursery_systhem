# Phase P7.2 — Notification Redesign: Diagnosis (P7.2.1) & Proposal (P7.2.2)

Date: 2026-11-07 · Status: **Diagnosis complete, awaiting implementation approval (P7.2.3)** · No frontend code changed in this step.

## P7.2.1 — Exact root cause of Admin redirect bug

**Flow (verified in source):**

1. `portal-workspace.tsx:550` mounts `<NotificationBell />` with **no props** in the header for every portal (admin/parent/staff/teacher).
2. `notifications-inbox.tsx:58,73` hardcodes `href="/parent/notifications"` (bell icon link + "View all" preview link). There is **no role-aware derivation** — grep confirms exactly these 2 hardcoded hits, no `/admin/notifications` anywhere.
3. `parent/[section]/page.tsx` renders `<PortalWorkspace portal="parent">` for any `section`; `rolesByPortal` (`portal-workspace.tsx:221-226`) = `{admin: [SUPER_ADMIN, ADMIN, DIRECTOR], parent: [PARENT]}`.
4. On mount, `PortalWorkspace` (`:289-301`) does `apiRequest("/auth/me")`; if `!expectedRoles.includes(user.role)` → `router.replace(roleHome[user.role])` where `roleHome.ADMIN → "/admin"`.
5. So: **Admin clicks bell → `/parent/notifications` → `PortalWorkspace(parent)` → role check fails (ADMIN ∉ [PARENT]) → `router.replace("/admin")`** — user is bounced to admin home; the inbox never renders. This is the user-visible "View details → /parent/notifications → redirected to /admin" loop.

**Secondary gaps:**
- `adminSections` (`portal-workspace.tsx:38-158`) has **no `notifications` entry** and `navByPortal.admin` (`:199`) has **no `notifications` key** — so even a direct `/admin/notifications` URL renders `section === undefined` (blank description, no inbox).
- `parentSections.notifications` (`:169`) exists, so Parent works today — but only because the bell lucks into the Parent path.
- `NotificationsInbox()` takes **no `portal` prop** — it is Parent-only by construction (hardcoded Parent `Link` destinations + no role-aware `link` rewriting).
- Backend `Notification.link` is already role-aware in P7.1 fan-out (`consumers.ts:77` admin links `/admin/admissions|children|activities`; `:109,207,221` parent links `/parent/applications|invoices`), but the frontend `Open` button (`notifications-inbox.tsx` render) emits the raw `link` without a role-prefix guard — safe today because each recipient only receives their own role's links, but a strict frontend rewrite could drift if a stale row carries the opposite prefix (defense: rewrite `/parent/*` → `/admin/*` or drop cross-portal links for admins).

## P7.2.2 — Proposed architecture

### Principles
- **Reuse backend contracts unchanged** (`GET /notifications?status&type&page&pageSize`, `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all`, `userId` from JWT, Socket `notification:new` on `user:<id>`). No new model, no migration, no new endpoint.
- **One shared design system, two role-aware shells** — same components, `portal: "admin" | "parent"` prop drives label copy, category list, and destination prefix.
- **Bell destination derived from session role**, never hardcoded: `roleHome[user.role]` from existing `roleHome` map (`portal-workspace.tsx:212-219`) → `/admin` vs `/parent`. ADMIN/SUPER_ADMIN/DIRECTOR → `/admin/notifications`; PARENT → `/parent/notifications`.

### Component plan (replace, don't duplicate)
| Old | Disposition |
|---|---|
| `NotificationBell` (emoji 🔔, absolute preview, hardcoded Parent href) | **Replace** with new `NotificationBell({portal})` — Lucide `Bell` icon, click-triggered dropdown (controlled `open` state, Esc close, focus trap-ish, `aria-expanded`), badge, "Mark as read" per-row, "View all" → `/${portal}/notifications`, `socket` live `unread+1`/prepend with `notification.id` dedupe, subtle `animate-pulse` dot only on new arrivals, no hover-only panels. |
| `NotificationsInbox` (single Parent view, inline styles, no search) | **Replace** with shared `NotificationCenter({portal})` + thin wrappers `AdminNotificationsPage` / `ParentNotificationsPage`. Cards (not table), category icons per `type` (Lucide: `Bell`, `ClipboardList`, `CalendarCheck`, `Clock`, `DollarSign`, `MessageSquare`, `TriangleAlert`, `Sparkles`), relative timestamps (`Intl.RelativeTimeFormat`), stats header (total/unread/read derived from `unread-count` + list `total`), All/Unread/Read segmented control, search input (client-filter on current page + server when `q` added — see backend note), pagination, detail drawer (click row → side panel with title/body/category/date + role-aware safe link), loading skeleton, empty illustration, error banner with retry, mark-read optimistically with rollback. |
| `portal-workspace.tsx` header + sections | **Modify**: pass `portal` to bell (`<NotificationBell portal={portal}>`), add `notifications` to `adminSections` + `navByPortal.admin` + render branch for custom `NotificationCenter` (skip generic CRUD table). `sectionHref` already builds `/${portal}/${key}` — no change needed beyond adding the key. Sidebar/mobile nav automatically pick the new `notifications` key via existing loops. |

### Proposed layouts

**Admin `/admin/notifications`:**
```
Header: "Notifications" + stats chips (Total N · Unread N · Read N) + [Mark all as read]
Toolbar: [All | Unread | Read] segmented · Category select (Enrollment, Children, Attendance, Activities, Meals, Finance, General) · Search input
List:  card rows — icon · title (semibold if unread, dot indicator) · body (2-line clamp) · relative time · [Mark read] · [Open → /admin/...]
Footer: pagination (Prev / Page x/y / Next)
Detail: slide-over with full title/body/category/createdAt + safe admin deep-link
```

**Parent `/parent/notifications` (same shell, Parent copy):**
```
Header: "Notifications" + stats chips · [Mark all as read]
Toolbar: [All | Unread | Read] · Category select (Enrollment, Attendance, Messages, Finance, General) · Search
List:  warm cards — same row structure, links prefixed /parent/..., "Open parent page" action
```

Both share `NotificationBell`, `NotificationCenter`, category-icon map, relative-time helper — only `portal` prop + copy/noun strings differ. Responsive: cards stack on mobile, detail becomes full-screen sheet; dropdown is `position: fixed` on mobile.

### Files intended to modify (P7.2.3–7.2.7)
1. `apps/web/src/components/notifications-inbox.tsx` — **replace** (new bell + center, Lucide icons, dropdown, detail drawer, skeletons).
2. `apps/web/src/components/portal-workspace.tsx` — bell gets `portal` prop; `adminSections.notifications` + `navByPortal.admin` add `notifications`; render `NotificationCenter` instead of generic table for `sectionName === "notifications"`.
3. Optional: `apps/web/src/components/notification-icons.tsx` (new small map, or inline in #1 — prefer inline to limit files).

### Files NOT touched
- `apps/api/src/notifications/*`, `kafka/consumers.ts`, `portal-workspace` generic CRUD, Prisma — **unchanged**.

### Required backend changes
- **Search (`q`) is not yet supported** (`InboxQueryDto` has only `status/type/page/pageSize`). Two options:
  - **A (recommended, zero backend):** client-side filter on the loaded page is misleading for server pagination; instead ship without search in P7.2 and note it as a fast follow.
  - **B (smallest safe enhancement):** add `q?: string` to `InboxQueryDto` → `where { OR: [{title: {contains: q, mode:"insensitive"}}, {body: {contains: q, mode:"insensitive"}}] }`, no migration, validated `MaxLength(100)`. Documented as a backend PR if you approve.
- No priority field, no new model — matches existing `NotificationType` enum; category select only lists types actually written by consumers (`CHECK_IN/CHECK_OUT/ABSENCE/MESSAGE/INVOICE/PAYMENT/ENROLLMENT/ACTIVITY/INCIDENT/GENERAL`).

### Testing plan (P7.2.7)
- Web unit: bell href per `portal`, dropdown open/close + keyboard, badge update on socket mock, unread/read filter, mark-one/all, link prefix per role.
- E2E manual matrix: login as Admin → bell → `/admin/notifications`; login as Parent → bell → `/parent/notifications`; cross-portal direct URL → `router.replace(roleHome)` bounce; new Kafka event → inbox live prepend; offline reload → PG history.

---

**Next step:** approve P7.2.3 (shared bell + center implementation). No code was changed in this step.
