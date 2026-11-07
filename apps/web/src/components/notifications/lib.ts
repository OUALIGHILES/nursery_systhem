"use client";

export type NotificationType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "ABSENCE"
  | "INVOICE"
  | "PAYMENT"
  | "MESSAGE"
  | "INCIDENT"
  | "ENROLLMENT"
  | "ACTIVITY"
  | "GENERAL";

export type NotificationRow = {
  id: string;
  type: string;
  channel?: string;
  title: string;
  body: string;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
};

// Admin categories supported by backend producers (audit P7.R6).
export const ADMIN_CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "", label: "All categories", icon: "◉" },
  { value: "ENROLLMENT", label: "Enrollment", icon: "✎" },
  { value: "GENERAL", label: "Children & Meals", icon: "●" },
  { value: "ACTIVITY", label: "Activities", icon: "✦" },
  { value: "MESSAGE", label: "Messages", icon: "✉" },
  { value: "INCIDENT", label: "Health & safety", icon: "⚠" },
  { value: "CHECK_IN", label: "Attendance", icon: "✓" },
  { value: "INVOICE", label: "Finance", icon: "◈" },
];

// Parent categories (only events written for parents).
export const PARENT_CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "", label: "All categories", icon: "◉" },
  { value: "ENROLLMENT", label: "Enrollment", icon: "✎" },
  { value: "CHECK_IN", label: "Attendance", icon: "✓" },
  { value: "CHECK_OUT", label: "Attendance", icon: "✓" },
  { value: "ABSENCE", label: "Attendance", icon: "✓" },
  { value: "MESSAGE", label: "Messages", icon: "✉" },
  { value: "INCIDENT", label: "Health & safety", icon: "⚠" },
  { value: "INVOICE", label: "Finance", icon: "◈" },
  { value: "PAYMENT", label: "Finance", icon: "◈" },
  { value: "GENERAL", label: "General", icon: "●" },
];

export type PortalKind = "admin" | "parent";

export function categoriesFor(portal: PortalKind): { value: string; label: string; icon: string }[] {
  return portal === "admin" ? ADMIN_CATEGORIES : PARENT_CATEGORIES;
}

export function categoryIcon(type: string, portal: PortalKind = "admin"): string {
  const found = categoriesFor(portal).find((c) => c.value === type);
  return found ? found.icon : "•";
}

export function categoryLabel(type: string, portal: PortalKind = "admin"): string {
  const found = categoriesFor(portal).find((c) => c.value === type);
  return found ? found.label : type;
}

/** Keep only admin-safe links; anything pointing at /parent/* falls back to the admin inbox. */
export function safeAdminLink(link: string | null | undefined): string {
  if (!link) return "/admin/notifications";
  if (link.startsWith("/admin/")) return link;
  if (link.startsWith("/chat")) return "/admin/messages";
  return "/admin/notifications";
}

/** Keep only parent-safe links; /admin/* falls back to the parent inbox (no cross-portal leak). */
export function safeParentLink(link: string | null | undefined): string {
  if (!link) return "/parent/notifications";
  if (link.startsWith("/parent/")) return link;
  if (link.startsWith("/chat")) return "/parent/messages";
  return "/parent/notifications";
}

export function safeLink(link: string | null | undefined, portal: PortalKind): string {
  return portal === "admin" ? safeAdminLink(link) : safeParentLink(link);
}

export function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function isInboxNotification(value: unknown): value is { notification: NotificationRow } {
  return (
    typeof value === "object" &&
    value !== null &&
    "notification" in (value as Record<string, unknown>) &&
    typeof (value as { notification: unknown }).notification === "object" &&
    (value as { notification: unknown }).notification !== null &&
    typeof (value as unknown as { notification: { id?: unknown } }).notification.id === "string" &&
    (value as unknown as { notification: { id: string } }).notification.id.length > 0
  );
}

/** Add a socket notification without duplicating by id (chat payloads are ignored). */
export function upsertNotification(items: NotificationRow[], incoming: unknown): NotificationRow[] {
  if (!isInboxNotification(incoming)) return items;
  const n = incoming.notification;
  if (items.some((x) => x.id === n.id)) return items;
  return [n, ...items];
}

/** True only for a genuinely new unread notification (no dup id, no readAt). */
export function isNewUnread(incoming: unknown, seenIds: Set<string>): boolean {
  if (!isInboxNotification(incoming)) return false;
  const n = incoming.notification;
  if (!n.id || seenIds.has(n.id)) return false;
  if (n.readAt) return false;
  return true;
}

/** Render title/body verbatim; only fall back when empty (never generic noise). */
export function displayTitle(n: NotificationRow): string {
  return n.title?.trim() ? n.title : "Notification";
}

const TYPE_FALLBACK: Record<string, string> = {
  ENROLLMENT: "Enrollment update — open to review your application.",
  CHECK_IN: "Your child checked in.",
  CHECK_OUT: "Your child checked out.",
  ABSENCE: "Your child was marked absent.",
  INVOICE: "New invoice issued.",
  PAYMENT: "Payment received.",
  MESSAGE: "New message from the nursery team.",
  INCIDENT: "An incident was reported involving your child.",
  ACTIVITY: "New activity recorded.",
  GENERAL: "Nursery update.",
};

export function displayBody(n: NotificationRow): string {
  if (n.body?.trim()) return n.body;
  return TYPE_FALLBACK[n.type] ?? "Nursery update.";
}

/** True when a notification is still unread (drives bell invisibility after read). */
export function isUnread(n: NotificationRow): boolean {
  return !n.readAt;
}
