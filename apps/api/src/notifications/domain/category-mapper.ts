export type NotificationTypeValue = "CHECK_IN" | "CHECK_OUT" | "ABSENCE" | "INVOICE" | "PAYMENT" | "MESSAGE" | "INCIDENT" | "ENROLLMENT" | "ACTIVITY" | "GENERAL";

export interface CategoryMapping {
  type: NotificationTypeValue;
  title: string;
  link: string | null;
}

const ADMIN_TOPICS = new Set(["enrollment.submitted", "child.enrolled", "child.updated", "activity.created", "meal.recorded"]);

/** True when the event should fan out to the admin trio only (never parents). */
export function isAdminEvent(topic: string): boolean {
  return ADMIN_TOPICS.has(topic);
}

/**
 * Pure mapper: event topic -> notification category + copy + portal-safe link.
 * Titles/bodies are built by the consumer from allowlisted payload fields only.
 */
export function mapCategory(topic: string, payload: Record<string, unknown>): CategoryMapping {
  switch (topic) {
    case "enrollment.submitted":
      return { type: "ENROLLMENT", title: "New enrollment application", link: "/admin/admissions" };
    case "enrollment.approved":
      return { type: "ENROLLMENT", title: "Enrollment approved", link: "/parent/applications" };
    case "enrollment.rejected":
      return { type: "ENROLLMENT", title: "Enrollment update", link: "/parent/applications" };
    case "child.enrolled":
      return { type: "GENERAL", title: "New child enrolled", link: "/admin/children" };
    case "child.updated":
      return { type: "GENERAL", title: "Child updated", link: "/admin/children" };
    case "activity.created":
      return { type: "ACTIVITY", title: "New activity created", link: "/admin/activities" };
    case "meal.recorded":
      return { type: "GENERAL", title: "Meal recorded", link: "/admin/meals" };
    case "attendance.checked_in":
      return { type: "CHECK_IN", title: "Checked in", link: "/parent/attendance" };
    case "attendance.checked_out":
      return { type: "CHECK_OUT", title: "Checked out", link: "/parent/attendance" };
    case "attendance.absent":
      return { type: "ABSENCE", title: "Marked absent", link: "/parent/attendance" };
    case "invoice.created":
      return { type: "INVOICE", title: "New invoice", link: "/parent/invoices" };
    case "payment.received":
      return { type: "PAYMENT", title: "Payment received", link: "/parent/invoices" };
    case "incident.reported":
      return { type: "INCIDENT", title: "Incident report", link: "/parent" };
    case "chat.message.created":
      return { type: "MESSAGE", title: "New message", link: "/parent/messages" };
    default:
      return { type: "GENERAL", title: "Notification", link: (payload.link as string | undefined) ?? null };
  }
}

export function composeAdminBody(topic: string, p: Record<string, unknown>): string {
  switch (topic) {
    case "enrollment.submitted":
      return `Application ${String(p.reference ?? p.id ?? "")} from ${String(p.parentEmail ?? "a parent")} needs review (${String(p.childName ?? "")}).`;
    case "activity.created":
      return `Activity "${String(p.title ?? "")}" created${p.classroomId ? ` (classroom ${String(p.classroomId)})` : ""}.`;
    case "child.enrolled":
      return `${String(p.firstName ?? "")} ${String(p.lastName ?? "")} enrolled.`;
    case "child.updated":
      return `Child ${String(p.id ?? "")} updated.`;
    case "meal.recorded":
      return `Meal ${String(p.mealType ?? "")} recorded for a child${p.childId ? ` (child ${String(p.childId)})` : ""}.`;
    default:
      return `Event ${topic} recorded.`;
  }
}
