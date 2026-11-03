import { z } from "zod";

// ---------- Domain enums (mirror Prisma schema) ----------
export const ROLES = ["SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF", "PARENT"] as const;
export type RoleName = (typeof ROLES)[number];

export const ATTENDANCE_STATUS = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const ENROLLMENT_STATUS = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "INFO_REQUESTED"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number];

export const INVOICE_STATUS = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const MEAL_TYPE = ["BREAKFAST", "LUNCH", "SNACK_MORNING", "SNACK_AFTERNOON"] as const;
export type MealType = (typeof MEAL_TYPE)[number];

export const EVENT_TYPE = ["HOLIDAY", "EVENT", "PARENT_MEETING", "CLASSROOM_ACTIVITY", "STAFF"] as const;
export type EventType = (typeof EVENT_TYPE)[number];

// ---------- API envelope ----------
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------- Auth ----------
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: RoleName;
  mustChangePassword: boolean;
}

// ---------- Validation schemas shared by web & mobile ----------
export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(32).optional().or(z.literal("")),
  subject: z.string().min(2).max(160),
  message: z.string().min(10).max(5000),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const enrollmentApplicationSchema = z.object({
  parentFirstName: z.string().min(2).max(80),
  parentLastName: z.string().min(2).max(80),
  parentEmail: z.string().email().max(254),
  parentPhone: z.string().min(6).max(32),
  parentAddress: z.string().min(4).max(300),
  relation: z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]),
  childFirstName: z.string().min(2).max(80),
  childLastName: z.string().min(2).max(80),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  childGender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  requestedProgram: z.enum(["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"]),
  requestedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  emergencyContactName: z.string().min(2).max(120),
  emergencyContactPhone: z.string().min(6).max(32),
  emergencyContactRelation: z.string().min(2).max(60),
  medicalNotes: z.string().max(4000).optional().or(z.literal("")),
  allergies: z.string().max(2000).optional().or(z.literal("")),
  additionalInfo: z.string().max(4000).optional().or(z.literal("")),
});
export type EnrollmentApplicationInput = z.infer<typeof enrollmentApplicationSchema>;

// ---------- Kafka event contracts ----------
export const KAFKA_TOPICS = [
  "child.enrolled",
  "child.updated",
  "attendance.checked_in",
  "attendance.checked_out",
  "attendance.absent",
  "invoice.created",
  "payment.received",
  "enrollment.approved",
  "enrollment.rejected",
  "activity.created",
  "incident.reported",
  "notification.requested",
  "chat.message.created",
  "chat.message.read",
  "chat.notification.requested",
] as const;
export type KafkaTopic = (typeof KAFKA_TOPICS)[number];

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  topic: KafkaTopic;
  occurredAt: string;
  actorId?: string | null;
  payload: T;
}
