"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiRequest, getPageItems, isRecord } from "../lib/api";

type Portal = "admin" | "parent" | "staff";
type Session = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};
type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "date" | "number" | "password" | "select";
  required?: boolean;
  options?: string[];
};
type Section = {
  label: string;
  description: string;
  endpoint?: string;
  columns?: string[];
  createEndpoint?: string;
  fields?: Field[];
};

const adminSections: Record<string, Section> = {
  dashboard: { label: "Overview", description: "A live snapshot of your nursery operations." },
  children: {
    label: "Children",
    description: "Manage child records, classroom assignments, and family links.",
    endpoint: "/children?page=1&pageSize=50",
    columns: ["firstName", "lastName", "dateOfBirth", "status", "classroom.name"],
    createEndpoint: "/children",
    fields: [
      { name: "firstName", label: "First name", required: true },
      { name: "lastName", label: "Last name", required: true },
      { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
      { name: "gender", label: "Gender", type: "select", options: ["PREFER_NOT_TO_SAY", "FEMALE", "MALE", "OTHER"], required: true },
    ],
  },
  parents: {
    label: "Parents",
    description: "Review parent accounts and linked family information.",
    endpoint: "/parents?page=1&pageSize=50",
    columns: ["user.firstName", "user.lastName", "user.email", "user.phone", "user.isActive"],
  },
  staff: {
    label: "Staff",
    description: "View staff profiles, roles, and classroom assignments.",
    endpoint: "/staff?page=1&pageSize=50",
    columns: ["user.firstName", "user.lastName", "user.email", "jobTitle", "department"],
  },
  users: {
    label: "User accounts",
    description: "Create and manage role-based access to the nursery platform.",
    endpoint: "/users?page=1&pageSize=50",
    columns: ["firstName", "lastName", "email", "role", "isActive"],
    createEndpoint: "/users",
    fields: [
      { name: "firstName", label: "First name", required: true },
      { name: "lastName", label: "Last name", required: true },
      { name: "email", label: "Email address", type: "email", required: true },
      { name: "role", label: "Role", type: "select", options: ["PARENT", "TEACHER", "STAFF", "DIRECTOR", "ADMIN"], required: true },
      { name: "temporaryPassword", label: "Temporary password (10+ characters, upper/lowercase and number)", type: "password", required: true },
    ],
  },
  classrooms: {
    label: "Classrooms",
    description: "Manage rooms, age groups, classroom capacity, and occupancy.",
    endpoint: "/classrooms",
    columns: ["name", "program", "ageGroupMin", "ageGroupMax", "capacity", "enrolled", "availablePlaces"],
    createEndpoint: "/classrooms",
    fields: [
      { name: "name", label: "Classroom name", required: true },
      { name: "program", label: "Program", type: "select", options: ["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"], required: true },
      { name: "ageGroupMin", label: "Minimum age (months)", type: "number", required: true },
      { name: "ageGroupMax", label: "Maximum age (months)", type: "number", required: true },
      { name: "capacity", label: "Capacity", type: "number", required: true },
      { name: "room", label: "Room number" },
    ],
  },
  attendance: {
    label: "Attendance",
    description: "Track daily check-ins, check-outs, and absences.",
    endpoint: `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`,
    columns: ["child.firstName", "child.lastName", "date", "status", "checkInAt", "checkOutAt"],
  },
  activities: {
    label: "Activities",
    description: "Plan classroom activities and review participation.",
    endpoint: "/activities?page=1&pageSize=50",
    columns: ["title", "scheduledAt", "durationMin", "classroom.name"],
    createEndpoint: "/activities",
    fields: [{ name: "title", label: "Activity title", required: true }, { name: "description", label: "Description" }, { name: "scheduledAt", label: "Scheduled date and time", type: "date" }],
  },
  meals: {
    label: "Meals",
    description: "Plan menus, note allergens, and review meal records.",
    endpoint: `/meals?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`,
    columns: ["name", "mealType", "date", "description", "allergens"],
    createEndpoint: "/meals",
    fields: [
      { name: "name", label: "Meal name", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "mealType", label: "Meal type", type: "select", options: ["BREAKFAST", "LUNCH", "SNACK_MORNING", "SNACK_AFTERNOON"], required: true },
      { name: "description", label: "Description" },
    ],
  },
  invoices: {
    label: "Invoices",
    description: "Review parent invoices, payment status, and balances.",
    endpoint: "/billing/invoices?page=1&pageSize=50",
    columns: ["number", "parentName", "total", "currency", "status", "dueDate"],
  },
  plans: {
    label: "Tuition plans",
    description: "View the tuition plans available to your families.",
    endpoint: "/billing/plans",
    columns: ["name", "program", "monthlyAmount", "currency", "isActive"],
    createEndpoint: "/billing/plans",
    fields: [{ name: "name", label: "Plan name", required: true }, { name: "monthlyAmount", label: "Monthly amount", type: "number", required: true }, { name: "currency", label: "Currency", required: true }],
  },
  reports: { label: "Reports", description: "Review real attendance and revenue information.", endpoint: "/billing/reports/revenue", columns: ["month", "amount"] },
  health: {
    label: "Health & safety",
    description: "Restricted health and safety incident information.",
    endpoint: "/health/incidents",
    columns: ["type", "severity", "occurredAt", "child.firstName", "child.lastName", "parentNotified"],
    createEndpoint: "/health/incidents",
    fields: [
      { name: "type", label: "Incident type", required: true },
      { name: "description", label: "Description (minimum 5 characters)", required: true },
      { name: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
      { name: "occurredAt", label: "Date", type: "date" },
    ],
  },
  admissions: {
    label: "Admissions",
    description: "Review enrollment applications and record statuses and internal notes. Status changes do not enroll a child or send an email.",
    endpoint: "/enrollment-applications?page=1&pageSize=50",
    columns: ["reference", "childFirstName", "childLastName", "parentEmail", "requestedProgram", "createdAt", "status"],
  },
  calendar: { label: "Calendar", description: "Calendar event management is not yet available through the current API." },
  documents: { label: "Documents", description: "Private document management is not yet available through the current API." },
  messages: { label: "Messages", description: "Secure conversations with your nursery community." },
};

const parentSections: Record<string, Section> = {
  dashboard: { label: "My nursery", description: "Your family’s nursery updates and everyday essentials." },
  children: { label: "My children", description: "Profiles for children linked to your account.", endpoint: "/children?page=1&pageSize=50", columns: ["firstName", "lastName", "dateOfBirth", "status", "classroom.name"] },
  attendance: { label: "Attendance", description: "Attendance records for your linked children.", endpoint: `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`, columns: ["child.firstName", "child.lastName", "date", "status", "checkInAt", "checkOutAt"] },
  meals: { label: "Meals", description: "Current menu and available meal information.", endpoint: `/meals?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`, columns: ["name", "mealType", "date", "description", "allergens"] },
  invoices: { label: "Invoices", description: "Your invoices and payment history.", endpoint: "/billing/invoices?page=1&pageSize=50", columns: ["number", "total", "currency", "status", "dueDate"] },
  messages: { label: "Messages", description: "Keep in touch with your child’s nursery team." },
  calendar: { label: "Calendar", description: "School events and family meetings are not yet available through the current API." },
  documents: { label: "Documents", description: "Private family document access is not yet available through the current API." },
};

const staffSections: Record<string, Section> = {
  dashboard: { label: "My day", description: "Your classroom work and today’s care operations." },
  children: { label: "My children", description: "Children in your assigned classrooms.", endpoint: "/children?page=1&pageSize=50", columns: ["firstName", "lastName", "dateOfBirth", "status", "classroom.name"] },
  attendance: { label: "Attendance", description: "Record and review attendance for assigned children.", endpoint: `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`, columns: ["child.firstName", "child.lastName", "date", "status", "checkInAt", "checkOutAt"] },
  activities: { label: "Activities", description: "Today’s classroom activities.", endpoint: "/activities?page=1&pageSize=50", columns: ["title", "scheduledAt", "durationMin", "classroom.name"] },
  meals: { label: "Meals", description: "Current meal schedule and classroom records.", endpoint: `/meals?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=50`, columns: ["name", "mealType", "date", "description", "allergens"] },
  messages: { label: "Messages", description: "Secure conversations with families and colleagues." },
  incidents: {
    label: "Incidents",
    description: "View and report safety incidents within your authorized classrooms.",
    endpoint: "/health/incidents",
    columns: ["type", "severity", "occurredAt", "child.firstName", "child.lastName", "parentNotified"],
    createEndpoint: "/health/incidents",
    fields: [
      { name: "type", label: "Incident type", required: true },
      { name: "description", label: "Description (minimum 5 characters)", required: true },
      { name: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true },
      { name: "occurredAt", label: "Date", type: "date" },
    ],
  },
  calendar: { label: "Calendar", description: "Staff schedules and events are not yet available through the current API." },
};

const navByPortal: Record<Portal, string[]> = {
  admin: ["dashboard", "children", "parents", "staff", "classrooms", "attendance", "activities", "meals", "invoices", "plans", "reports", "admissions", "health", "calendar", "documents", "messages", "users"],
  parent: ["dashboard", "children", "attendance", "meals", "invoices", "calendar", "documents", "messages"],
  staff: ["dashboard", "children", "attendance", "activities", "meals", "incidents", "calendar", "messages"],
};

const sectionsByPortal: Record<Portal, Record<string, Section>> = {
  admin: adminSections,
  parent: parentSections,
  staff: staffSections,
};

const roleHome: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ADMIN: "/admin",
  DIRECTOR: "/admin",
  TEACHER: "/staff",
  STAFF: "/staff",
  PARENT: "/parent",
};

const rolesByPortal: Record<Portal, string[]> = {
  admin: ["SUPER_ADMIN", "ADMIN", "DIRECTOR"],
  staff: ["TEACHER", "STAFF", "DIRECTOR", "ADMIN", "SUPER_ADMIN"],
  parent: ["PARENT"],
};

const portalTitles: Record<Portal, string> = {
  admin: "Administration",
  parent: "Family portal",
  staff: "Staff workspace",
};

function getValue(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, row);
}

function pretty(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(pretty).join(", ");
  if (isRecord(value)) return Object.values(value).map(pretty).filter((part) => part !== "—").join(" ");
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) {
    return new Date(value).toLocaleString();
  }
  return String(value);
}

export function PortalWorkspace({ portal, section: sectionProp = "dashboard" }: { portal: Portal; section?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewApplication, setReviewApplication] = useState<Record<string, unknown> | null>(null);
  const [reviewStatus, setReviewStatus] = useState("UNDER_REVIEW");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const sectionName = sectionProp || "dashboard";
  const sections = sectionsByPortal[portal];
  const section = sections[sectionName];
  const expectedRoles = rolesByPortal[portal];

  useEffect(() => {
    let active = true;
    void apiRequest<Session>("/auth/me")
      .then((user) => {
        if (!active) return;
        if (!expectedRoles.includes(user.role)) {
          router.replace(roleHome[user.role] ?? "/login");
          return;
        }
        setSession(user);
      })
      .catch(() => {
        if (active) router.replace("/login");
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, [router, portal, expectedRoles]);

  const refresh = useCallback(async () => {
    if (!session) return;
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      if (sectionName === "dashboard") {
        const checks = portal === "admin"
          ? [["children", "/children?page=1&pageSize=1"], ["parents", "/parents?page=1&pageSize=1"], ["staff", "/staff?page=1&pageSize=1"], ["classrooms", "/classrooms"], ["attendance", `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=100`], ["invoices", "/billing/invoices?page=1&pageSize=100"]]
          : portal === "staff"
            ? [["children", "/children?page=1&pageSize=1"], ["attendance", `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=100`], ["activities", "/activities?page=1&pageSize=100"], ["meals", `/meals?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=100`]]
            : [["children", "/children?page=1&pageSize=1"], ["attendance", `/attendance?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=100`], ["invoices", "/billing/invoices?page=1&pageSize=100"], ["meals", `/meals?date=${new Date().toISOString().slice(0, 10)}&page=1&pageSize=100`]];
        const results = await Promise.allSettled(checks.map(([, endpoint]) => apiRequest<unknown>(endpoint)));
        const values: Record<string, number> = {};
        let failures = 0;
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            failures++;
            return;
          }
          const [key] = checks[index];
          const data = result.value;
          if (isRecord(data) && typeof data.total === "number") values[key] = data.total;
          else values[key] = getPageItems(data).length;
        });
        setSummary(values);
        setRows([]);
        if (failures === results.length) setError("The dashboard could not load data from the API.");
      } else if (section?.endpoint) {
        const result = await apiRequest<unknown>(section.endpoint);
        setRows(getPageItems(result));
        if (isRecord(result) && typeof result.total === "number") {
          setSummary({ total: result.total });
        } else {
          setSummary({});
        }
      } else {
        setRows([]);
        setSummary({});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this section.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session, sectionName, portal, section]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  }, [rows, search]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!section?.createEndpoint) return;
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of section.fields ?? []) {
      const value = String(formData.get(field.name) ?? "").trim();
      if (!value) continue;
      payload[field.name] = field.type === "number" ? Number(value) : value;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(section.createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setNotice(`${section.label.slice(0, -1) || section.label} created successfully.`);
      setFormOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record.");
    } finally {
      setSaving(false);
    }
  }

  async function openReview(row: Record<string, unknown>) {
    if (typeof row.id !== "string") return;
    setReviewApplication(null);
    setReviewLoading(true);
    setError(null);
    try {
      const application = await apiRequest<Record<string, unknown>>(`/enrollment-applications/${row.id}`);
      setReviewApplication(application);
      setReviewStatus(typeof application.status === "string" ? application.status : "PENDING");
      setReviewNotes(typeof application.adminNotes === "string" ? application.adminNotes : "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the application.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewApplication || typeof reviewApplication.id !== "string") return;
    setReviewSaving(true);
    setError(null);
    try {
      await apiRequest(`/enrollment-applications/${reviewApplication.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: reviewStatus, adminNotes: reviewNotes }),
      });
      setReviewApplication(null);
      setNotice("Application review saved.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the application.");
    } finally {
      setReviewSaving(false);
    }
  }

  async function signOut() {
    try {
      await apiRequest("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } finally {
      router.replace("/login");
    }
  }

  if (authLoading || !session) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f7f3] text-sm font-medium text-[#5b7169]">Loading your secure workspace…</main>;
  }

  if (!section) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f7f3] px-5 text-center"><div><h1 className="text-2xl font-bold text-[#17342d]">Page not found</h1><Link className="mt-4 inline-block text-sm font-semibold text-[#2b6d4f]" href={`/${portal}`}>Return to workspace</Link></div></main>;
  }

  const nav = navByPortal[portal];
  const isAdmin = portal === "admin";
  const title = section.label;
  const dashboardStats = portal === "admin"
    ? [["Children enrolled", summary.children], ["Parents", summary.parents], ["Staff members", summary.staff], ["Classrooms", summary.classrooms], ["Attendance today", summary.attendance], ["Invoices", summary.invoices]]
    : portal === "staff"
      ? [["My children", summary.children], ["Attendance today", summary.attendance], ["Activities", summary.activities], ["Meals today", summary.meals]]
      : [["My children", summary.children], ["Attendance today", summary.attendance], ["My invoices", summary.invoices], ["Today’s meals", summary.meals]];
  const reviewDetails: [string, unknown][] = reviewApplication
    ? [
        ["Parent", `${pretty(reviewApplication.parentFirstName)} ${pretty(reviewApplication.parentLastName)}`],
        ["Parent email", reviewApplication.parentEmail],
        ["Parent phone", reviewApplication.parentPhone],
        ["Address", reviewApplication.parentAddress],
        ["Child", `${pretty(reviewApplication.childFirstName)} ${pretty(reviewApplication.childLastName)}`],
        ["Date of birth", reviewApplication.childDateOfBirth],
        ["Program", reviewApplication.requestedProgram],
        ["Preferred start", reviewApplication.requestedStartDate],
        ["Emergency contact", reviewApplication.emergencyContactName],
        ["Emergency phone", reviewApplication.emergencyContactPhone],
        ["Relationship", reviewApplication.emergencyContactRelation],
        ["Allergies", reviewApplication.allergies],
        ["Medical notes", reviewApplication.medicalNotes],
        ["Additional information", reviewApplication.additionalInfo],
      ]
    : [];

  return (
    <div className={`portal-workspace min-h-screen ${isAdmin ? "admin-workspace" : "bg-[#f4f7f5] text-[#18342d]"}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[258px] flex-col border-r lg:flex ${isAdmin ? "admin-sidebar border-[#e8e6dc] bg-[#fbf9f2]" : "border-[#e4ebe7] bg-white"}`}>
        <Link href="/" className="flex items-center gap-3 border-b border-[#edf1ee] px-6 py-5">
          <span className={`grid size-10 place-items-center rounded-full text-sm font-semibold tracking-[-0.08em] ${isAdmin ? "bg-[#293d35] text-white" : "rounded-2xl bg-[#e6f4ed] font-black text-[#26714c]"}`}>{isAdmin ? "ls." : "L"}</span>
          <span><span className="block text-sm font-bold">{isAdmin ? "little steps" : "Little Steps"}</span><span className="text-xs text-[#809089]">{isAdmin ? "Nursery management" : portalTitles[portal]}</span></span>
        </Link>
        <div className="px-5 pb-3 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9aa8a1]">{isAdmin ? "Your workspace" : "Workspace"}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-5">
          {nav.map((key) => {
            const item = sections[key];
            const href = key === "dashboard" ? `/${portal}` : `/${portal}/${key}`;
            const active = sectionName === key;
            return <Link key={key} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isAdmin ? active ? "bg-[#293d35] text-white shadow-[0_8px_18px_rgba(41,61,53,0.12)]" : "text-[#647069] hover:bg-[#edf2ea] hover:text-[#293d35]" : active ? "bg-[#eaf5ee] text-[#286b4d]" : "text-[#61746c] hover:bg-[#f5f8f6] hover:text-[#17342d]"}`}><NavIcon name={key} active={active} /><span>{item?.label ?? key}</span>{isAdmin && key === "admissions" && <span className={`ml-auto size-1.5 rounded-full ${active ? "bg-[#e9a88e]" : "bg-[#788f75]"}`} />}</Link>;
          })}
        </nav>
        <div className={`border-t p-4 ${isAdmin ? "border-[#e8e6dc]" : "border-[#edf1ee]"}`}>
          <button type="button" onClick={() => void signOut()} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#61746c] transition hover:bg-[#f5f8f6] hover:text-[#17342d]">Sign out</button>
        </div>
      </aside>

      <div className="lg:pl-[258px]">
        <header className={`sticky top-0 z-20 flex h-[68px] items-center justify-between border-b px-5 backdrop-blur-md sm:px-8 ${isAdmin ? "border-[#e8e6dc] bg-[#f7f3e9]/90" : "border-[#e4ebe7] bg-white/90"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold tracking-[-0.08em] lg:hidden ${isAdmin ? "bg-[#293d35] text-white" : "rounded-xl bg-[#e6f4ed] font-black text-[#26714c]"}`}>{isAdmin ? "ls." : "L"}</Link>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{isAdmin ? "Nursery management" : portalTitles[portal]}</p><p className="truncate text-xs text-[#829189]">{session.firstName} {session.lastName} · {session.role.replaceAll("_", " ")}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/chat" className={`hidden rounded-full border px-4 py-2 text-xs font-semibold transition sm:inline-flex ${isAdmin ? "border-[#d7d9cd] text-[#526b55] hover:bg-white" : "rounded-xl border-[#e4ebe7] text-[#52675e] hover:bg-[#f6faf7]"}`}>Open messages</Link>
            <button type="button" onClick={() => void signOut()} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#52675e] hover:bg-[#f6faf7] lg:hidden">Sign out</button>
            <div className="grid size-9 place-items-center rounded-full bg-[#dff2e6] text-xs font-bold text-[#286b4d]">{session.firstName[0]}{session.lastName[0]}</div>
          </div>
        </header>

        <main className={`mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-7 sm:py-8 lg:px-9 ${isAdmin ? "admin-main" : ""}`}>
          {isAdmin && sectionName === "dashboard" ? (
            <div className="mb-4 flex justify-end">
              <button onClick={() => void refresh()} type="button" className="rounded-full border border-[#d7d9cd] bg-white/70 px-4 py-2.5 text-sm font-semibold text-[#526b55] transition hover:bg-white">Refresh overview</button>
            </div>
          ) : isAdmin ? (
            <section className="admin-section-hero relative mb-7 overflow-hidden rounded-[28px] border border-[#e8e6dc] bg-[#fffdf8] p-5 shadow-[0_12px_35px_rgba(41,61,53,0.045)] sm:p-8">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full border border-[#788f75]/15" />
              <span aria-hidden="true" className="pointer-events-none absolute right-24 -top-14 size-44 rounded-full bg-[#e9a88e]/10" />
              <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#788f75]">
                    <Link href="/admin" className="transition hover:text-[#293d35]">Your workspace</Link>
                    <span aria-hidden="true" className="text-[#b0b3a9]">/</span>
                    <span className="text-[#9a9d94]">Administration</span>
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#edf2ea] text-[#526b55] sm:size-12"><NavIcon name={sectionName} /></span>
                    <h1 className="font-[family-name:var(--font-heading)] text-[clamp(2rem,4vw,3.35rem)] font-medium leading-[1.02] tracking-[-0.065em] text-[#293d35]">
                      {title}<span className="font-[family-name:var(--font-editorial)] font-normal italic text-[#788f75]">.</span>
                    </h1>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-[#747c72] sm:text-[15px]">{section.description}</p>
                </div>
                <div className="relative flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                  {section.endpoint && (
                    <div className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-[#e8e6dc] bg-white/85 px-4 py-3">
                      <span className="grid size-9 place-items-center rounded-full bg-[#faeee8] text-[#a66e58]"><NavIcon name={sectionName} /></span>
                      <div><p className="font-[family-name:var(--font-heading)] text-xl font-semibold leading-none text-[#293d35]">{loading ? "—" : summary.total ?? rows.length}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a9d94]">{summary.total === undefined ? "Records loaded" : "Total records"}</p></div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => void refresh()} type="button" className="rounded-full border border-[#d7d9cd] bg-white/80 px-4 py-2.5 text-sm font-semibold text-[#526b55] transition hover:bg-white">Refresh</button>
                    {section.createEndpoint && <button onClick={() => { setNotice(null); setFormOpen(true); }} type="button" className="rounded-full bg-[#293d35] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(41,61,53,0.15)] transition hover:-translate-y-0.5 hover:bg-[#526b55]">Add {section.label.replace(/s$/, "").toLowerCase()}</button>}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#788f75]">{isAdmin ? "Little Steps · Administration" : portalTitles[portal]}</p><h1 className={`mt-2 font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.055em] ${isAdmin ? "text-[#293d35] sm:text-4xl" : "text-[#17342d]"}`}>{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#747c72]">{section.description}</p></div>
              <div className="flex gap-2">
                <button onClick={() => void refresh()} type="button" className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${isAdmin ? "border-[#d7d9cd] bg-white/70 text-[#526b55] hover:bg-white" : "rounded-xl border-[#dfe8e3] bg-white text-[#52675e] shadow-sm hover:bg-[#f8faf9]"}`}>Refresh</button>
                {section.createEndpoint && <button onClick={() => { setNotice(null); setFormOpen(true); }} type="button" className="rounded-full bg-[#293d35] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(41,61,53,0.15)] transition hover:bg-[#526b55]">Add {section.label.replace(/s$/, "").toLowerCase()}</button>}
              </div>
            </div>
          )}

          {sectionName === "dashboard" ? isAdmin ? (
            <div className="space-y-9">
              <section className="admin-home-hero grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
                <div className="relative z-10 py-2">
                  <p className="inline-flex items-center gap-2 rounded-full border border-[#dfe2d4] bg-white/70 px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-[#526b55] shadow-sm">
                    <span className="size-1.5 rounded-full bg-[#788f75]" />
                    Your nursery, at a glance
                  </p>
                  <h1 className="mt-6 max-w-[650px] font-[family-name:var(--font-heading)] text-[clamp(2.8rem,5.2vw,5rem)] font-medium leading-[0.98] tracking-[-0.075em] text-[#293d35]">
                    Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {session.firstName}. <span className="font-[family-name:var(--font-editorial)] font-normal italic text-[#788f75]">Little things grow here.</span>
                  </h1>
                  <p className="mt-5 max-w-[500px] text-[15px] leading-7 text-[#747c72]">
                    A thoughtful overview of the people, classrooms, and everyday moments that make up your nursery.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <Link href="/admin/children" className="inline-flex items-center gap-3 rounded-full bg-[#293d35] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_25px_rgba(41,61,53,0.15)] transition hover:-translate-y-0.5 hover:bg-[#526b55]">
                      Explore your nursery <span aria-hidden="true">→</span>
                    </Link>
                    <Link href="/admin/admissions" className="inline-flex items-center rounded-full border border-[#d7d9cd] px-5 py-3 text-sm font-semibold text-[#293d35] transition hover:bg-white/70">
                      Admissions
                    </Link>
                  </div>
                  <p className="mt-7 flex items-center gap-2 text-xs font-medium text-[#747c72]">
                    <span className="grid size-7 place-items-center rounded-full bg-[#edf2ea] text-[#526b55]"><NavIcon name="health" /></span>
                    Your overview is based on live nursery records
                  </p>
                </div>

                <div className="relative mx-auto w-full max-w-[650px] lg:ml-auto">
                  <span aria-hidden="true" className="absolute -right-3 top-3 size-24 rounded-full bg-[#e9a88e]/50 sm:-right-5 sm:size-32" />
                  <span aria-hidden="true" className="absolute -bottom-4 left-[7%] size-20 rounded-full bg-[#c8bce8]/55" />
                  <div className="relative ml-auto aspect-[1.13] w-[88%] overflow-hidden rounded-[48%_48%_30px_30px] bg-[#dbe2d7] shadow-[0_28px_70px_rgba(41,61,53,0.14)]">
                    <Image
                      src="https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1400&q=85"
                      alt="A child enjoying a creative activity in a bright early learning space"
                      fill
                      unoptimized
                      sizes="(max-width: 1024px) 90vw, 48vw"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#20342d]/25 via-transparent to-transparent" />
                    <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-[11px] font-semibold text-[#293d35] backdrop-blur-md">
                      Little moments, thoughtfully cared for
                    </span>
                  </div>
                  <div className="absolute -left-1 top-[16%] max-w-[190px] rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_15px_40px_rgba(41,61,53,0.12)] backdrop-blur-md sm:-left-3 sm:max-w-[210px] sm:p-5">
                    <span className="grid size-9 place-items-center rounded-full bg-[#faeee8] text-[#a96952]"><NavIcon name="health" /></span>
                    <p className="mt-3 font-[family-name:var(--font-heading)] text-sm font-bold text-[#293d35]">Every child matters</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#747c72]">Your teams and families, all in one place.</p>
                  </div>
                  <div className="absolute -right-1 bottom-[13%] max-w-[195px] rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_15px_40px_rgba(41,61,53,0.12)] backdrop-blur-md sm:-right-2 sm:max-w-[215px] sm:p-5">
                    <span className="grid size-9 place-items-center rounded-full bg-[#edf2ea] text-[#526b55]"><NavIcon name="activities" /></span>
                    <p className="mt-3 font-[family-name:var(--font-heading)] text-sm font-bold text-[#293d35]">A day full of possibility</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#747c72]">See what is happening across your nursery.</p>
                  </div>
                </div>
              </section>

              {error && <ErrorBanner message={error} />}

              <section aria-label="Nursery overview">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#788f75]">The bigger picture</p>
                    <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-medium tracking-[-0.05em] text-[#293d35]">Your nursery, at a glance</h2>
                  </div>
                  <span className="text-xs text-[#9a9d94]">Live from your nursery records</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dashboardStats.map(([label, count], index) => (
                    <article key={String(label)} className={`admin-stat rounded-[22px] border border-[#e8e6dc] p-5 shadow-[0_8px_28px_rgba(41,61,53,0.035)] ${index % 4 === 1 ? "bg-[#fffdf8]" : "bg-white"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#747c72]">{label}</span>
                        <span className={`grid size-10 place-items-center rounded-full ${index % 3 === 1 ? "bg-[#faeee8] text-[#a66e58]" : index % 3 === 2 ? "bg-[#f1edf8] text-[#786b9c]" : "bg-[#edf2ea] text-[#526b55]"}`}>
                          <NavIcon name={String(label)} />
                        </span>
                      </div>
                      <div className="mt-4 font-[family-name:var(--font-heading)] text-3xl font-semibold tracking-[-0.05em] text-[#293d35]">{loading ? "—" : count ?? "—"}</div>
                      <div className="mt-1 text-xs text-[#9a9d94]">{count === undefined ? "No data available" : "Live from the database"}</div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
                <div className="rounded-[24px] border border-[#e8e6dc] bg-white p-5 shadow-[0_12px_35px_rgba(41,61,53,0.04)] sm:p-7">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#788f75]">Your workspace</p>
                      <h2 className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-medium tracking-[-0.05em] text-[#293d35]">Where would you like to go?</h2>
                    </div>
                    <span className="rounded-full bg-[#edf2ea] px-3 py-1.5 text-[11px] font-semibold text-[#526b55]">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {nav.filter((key) => key !== "dashboard").slice(0, 8).map((key) => (
                      <Link key={key} href={`/admin/${key}`} className="group flex items-center gap-3 rounded-2xl border border-[#e8e6dc] bg-[#fffdf8] p-3.5 transition hover:-translate-y-0.5 hover:border-[#c8d3c4] hover:bg-[#edf2ea]">
                        <span className="grid size-10 place-items-center rounded-full bg-white text-[#526b55] shadow-sm"><NavIcon name={key} /></span>
                        <span className="text-sm font-semibold text-[#293d35]">{sections[key]?.label}</span>
                        <span className="ml-auto text-[#9a9d94] transition group-hover:translate-x-1 group-hover:text-[#526b55]">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-[24px] bg-[#293d35] p-6 text-white shadow-[0_18px_42px_rgba(41,61,53,0.12)] sm:p-7">
                  <span aria-hidden="true" className="absolute -right-14 -top-16 size-48 rounded-full border border-white/10" />
                  <span aria-hidden="true" className="absolute -right-3 -top-7 size-28 rounded-full border border-white/10" />
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-[#e9c2ae]">A lovely beginning</p>
                  <h2 className="relative mt-4 font-[family-name:var(--font-heading)] text-3xl font-medium leading-tight tracking-[-0.055em]">New families are finding their way to you.</h2>
                  <p className="relative mt-3 text-sm leading-6 text-white/70">Review incoming applications and help each family take their next little step.</p>
                  <Link href="/admin/admissions" className="relative mt-6 inline-flex items-center gap-3 rounded-full bg-[#f7f3e9] px-5 py-3 text-sm font-bold text-[#293d35] transition hover:-translate-y-0.5 hover:bg-white">Visit admissions <span aria-hidden="true">→</span></Link>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-[26px] bg-[linear-gradient(115deg,#183a31,#285e49)] p-6 text-white shadow-[0_20px_50px_rgba(24,58,49,0.16)] sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c2e7d0]">A warm welcome</p>
                <h2 className="mt-2 text-2xl font-bold">Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {session.firstName}.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e1eee6]">Here’s a current view of the information available to your account. Counts come directly from your nursery data.</p>
              </section>
              {error && <ErrorBanner message={error} />}
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dashboardStats.map(([label, count]) => <article key={String(label)} className="rounded-2xl border border-[#e5ece8] bg-white p-5 shadow-[0_8px_28px_rgba(30,60,46,0.035)]"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[#708079]">{label}</span><span className="grid size-9 place-items-center rounded-xl bg-[#f0f7f2] text-[#42815e]"><NavIcon name={String(label)} /></span></div><div className="mt-4 text-3xl font-black tracking-tight">{loading ? "—" : count ?? "—"}</div><div className="mt-1 text-xs text-[#9aa8a1]">{count === undefined ? "No data available" : "Live from the database"}</div></article>)}
              </section>
              <section className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
                <div className="rounded-2xl border border-[#e5ece8] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="font-bold">Today at a glance</h3><p className="mt-1 text-xs text-[#87958e]">Operational shortcuts</p></div><span className="rounded-full bg-[#f0f7f2] px-3 py-1 text-[11px] font-semibold text-[#43815f]">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{nav.filter((key) => key !== "dashboard").slice(0, 6).map((key) => <Link key={key} href={`/${portal}/${key}`} className="flex items-center gap-3 rounded-xl border border-[#edf1ee] p-3 transition hover:border-[#cfe2d6] hover:bg-[#f8fbf9]"><span className="grid size-9 place-items-center rounded-xl bg-[#eff7f1] text-[#367351]"><NavIcon name={key} /></span><span className="text-sm font-semibold">{sections[key]?.label}</span><span className="ml-auto text-[#97a69f]">→</span></Link>)}</div></div>
                <div className="rounded-2xl border border-[#e5ece8] bg-white p-5 sm:p-6"><h3 className="font-bold">Getting started</h3><p className="mt-1 text-xs leading-5 text-[#87958e]">Use the navigation to manage your work. Access is limited by the role assigned to your account.</p><div className="mt-5 space-y-3">{[["Review records", "Open a section to see current data."], ["Keep things current", "Use refresh after changes."], ["Need help?", "Contact nursery administration."]].map(([heading, detail]) => <div key={heading} className="flex gap-3"><span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-[#e9f5ed] text-[10px] font-bold text-[#367351]">✓</span><div><div className="text-sm font-semibold">{heading}</div><div className="mt-0.5 text-xs leading-5 text-[#83928b]">{detail}</div></div></div>)}</div></div>
              </section>
            </div>
          ) : section.endpoint ? (
            <section className={`overflow-hidden rounded-[24px] border bg-white ${isAdmin ? "admin-records-panel border-[#e8e6dc] shadow-[0_14px_38px_rgba(41,61,53,0.055)]" : "border-[#e4ebe7] shadow-[0_10px_30px_rgba(30,60,46,0.035)]"}`}>
              <div className="flex flex-col gap-3 border-b border-[#edf1ee] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                <div><h2 className={`font-[family-name:var(--font-heading)] ${isAdmin ? "text-lg font-semibold tracking-[-0.03em] text-[#293d35]" : "font-bold"}`}>{isAdmin ? `${title} directory` : title}</h2><p className="mt-1 text-xs text-[#84928b]">{summary.total !== undefined ? `${summary.total} records` : `${rows.length} records loaded`}</p></div>
                <label className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm ${isAdmin ? "border-[#e8e6dc] bg-[#fbf9f2] text-[#526b55]" : "border-[#e5ece8] bg-[#fafcfb] text-[#73827b]"}`}><span aria-hidden="true">⌕</span><input aria-label={`Search ${title}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} className="w-full bg-transparent outline-none sm:w-56" /></label>
              </div>
              {error && <div className="p-5"><ErrorBanner message={error} /></div>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead><tr className={`text-[10px] uppercase tracking-[0.14em] ${isAdmin ? "bg-[#f7f3e9] text-[#788076]" : "bg-[#f8faf9] text-[#87958e]"}`}>{(section.columns ?? Object.keys(rows[0] ?? {}).slice(0, 5)).map((col) => <th key={col} className="px-5 py-4 font-bold">{col.split(".").at(-1)?.replace(/([A-Z])/g, " $1")}</th>)}{sectionName === "admissions" && <th className="px-5 py-4 font-bold">Review</th>}</tr></thead>
                  <tbody className={isAdmin ? "divide-y divide-[#f0eee6]" : "divide-y divide-[#eff2f0]"}>
                    {loading ? Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={(section.columns?.length ?? 5) + (sectionName === "admissions" ? 1 : 0)} className="px-5 py-4"><div className="h-4 animate-pulse rounded bg-[#f0f4f1]" /></td></tr>) : filteredRows.map((row, i) => <tr key={String(row.id ?? i)} className="transition hover:bg-[#fbfdfb]">{(section.columns ?? Object.keys(row).slice(0, 5)).map((col) => <td key={col} className="max-w-[260px] truncate px-5 py-4 text-[#536860]">{pretty(getValue(row, col))}</td>)}{sectionName === "admissions" && <td className="px-5 py-4"><button type="button" onClick={() => void openReview(row)} className="rounded-lg border border-[#dfe8e3] px-3 py-2 text-xs font-semibold text-[#286b4d] hover:bg-[#f1f7f3]">Review</button></td>}</tr>)}
                    {!loading && filteredRows.length === 0 && <tr><td colSpan={(section.columns?.length ?? 5) + (sectionName === "admissions" ? 1 : 0)} className="px-5 py-16 text-center"><div className={`mx-auto grid size-12 place-items-center rounded-full text-lg ${isAdmin ? "bg-[#edf2ea] text-[#526b55]" : "bg-[#f1f7f3] text-[#44815f]"}`}><NavIcon name={sectionName} /></div><p className="mt-4 font-[family-name:var(--font-heading)] text-base font-semibold text-[#293d35]">{search ? "No matching records" : "No records yet"}</p><p className="mt-1 text-xs text-[#8a9891]">{search ? "Try another search." : "Records will appear here when available."}</p></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className={`relative overflow-hidden rounded-[28px] border bg-white p-7 shadow-[0_14px_38px_rgba(41,61,53,0.055)] sm:p-12 ${isAdmin ? "border-[#e8e6dc]" : "border-[#e4ebe7]"}`}>
              <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border border-[#788f75]/15" />
              <div className="relative mx-auto max-w-xl text-center"><div className={`mx-auto grid size-16 place-items-center rounded-full ${isAdmin ? "bg-[#edf2ea] text-[#526b55]" : "bg-[#eff7f1] text-[#367351]"}`}><NavIcon name={sectionName} /></div><h2 className="mt-5 font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-[-0.04em] text-[#293d35]">{sectionName === "messages" ? "Stay close to your community." : `${title}, thoughtfully managed.`}</h2><p className="mt-3 text-sm leading-6 text-[#77877f]">{section.description}</p>{sectionName === "messages" ? <Link href="/chat" className={`mt-6 inline-flex rounded-full px-5 py-3 text-sm font-semibold text-white transition ${isAdmin ? "bg-[#293d35] hover:bg-[#526b55]" : "bg-[#246b4b] hover:bg-[#1d5c40]"}`}>Open secure messages <span aria-hidden="true" className="ml-2">→</span></Link> : <p className="mt-5 inline-flex rounded-full bg-[#f7f3e9] px-4 py-2 text-xs leading-5 text-[#747c72]">This section will become interactive when its management workflow is available.</p>}</div>
            </section>
          )}
        </main>
      </div>

      <nav aria-label="Workspace navigation" className={`fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t px-2 py-2 backdrop-blur-md lg:hidden ${isAdmin ? "border-[#e8e6dc] bg-[#fbf9f2]/95" : "border-[#e4ebe7] bg-white/95"}`}>
        {nav.filter((key) => isAdmin || ["dashboard", "children", "attendance", "meals", "invoices", "messages", "staff", "classrooms"].includes(key)).map((key) => <Link key={key} href={key === "dashboard" ? `/${portal}` : `/${portal}/${key}`} aria-current={sectionName === key ? "page" : undefined} className={`flex min-w-[68px] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${sectionName === key ? isAdmin ? "bg-[#293d35] text-white" : "bg-[#eaf5ee] text-[#286b4d]" : "text-[#708079]"}`}><NavIcon name={key} /><span>{sections[key]?.label?.split(" ")[0] ?? key}</span></Link>)}
      </nav>

      {formOpen && section.fields && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10231e]/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-title" className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8 ${isAdmin ? "admin-dialog" : ""}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d8678]">New record</p><h2 id="create-title" className="mt-1 text-2xl font-black">{section.label}</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Close dialog" className="grid size-9 place-items-center rounded-xl bg-[#f2f6f3] text-[#52675e]">×</button></div><form onSubmit={(event) => void submitCreate(event)} className="mt-6 space-y-4">{section.fields.map((field) => <label key={field.name} className="block text-sm font-semibold text-[#3d594e]">{field.label}{field.type === "select" ? <select required={field.required} name={field.name} className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]">{field.options?.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select> : <input required={field.required} name={field.name} type={field.type ?? "text"} step={field.type === "number" ? "any" : undefined} className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]" />}</label>)}{error && <ErrorBanner message={error} />}<button disabled={saving} type="submit" className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${isAdmin ? "bg-[#293d35] hover:bg-[#526b55]" : "bg-[#246b4b] hover:bg-[#1d5c40]"}`}>{saving ? "Saving…" : "Create record"}</button></form></section></div>}
      {reviewLoading && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10231e]/45 p-4" role="status">Loading application…</div>}
      {reviewApplication && <div className="fixed inset-0 z-50 grid place-items-center bg-[#10231e]/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewApplication(null); }}><section role="dialog" aria-modal="true" aria-labelledby="review-title" className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8 ${isAdmin ? "admin-dialog" : ""}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d8678]">Enrollment application · {String(reviewApplication.reference)}</p><h2 id="review-title" className="mt-1 text-2xl font-black">Review application</h2></div><button type="button" onClick={() => setReviewApplication(null)} aria-label="Close dialog" className="grid size-9 place-items-center rounded-xl bg-[#f2f6f3] text-[#52675e]">×</button></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{reviewDetails.map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7faf8] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#84928b]">{label}</p><p className="mt-1 break-words text-sm text-[#3d594e]">{pretty(value)}</p></div>)}</div><form onSubmit={(event) => void saveReview(event)} className="mt-6 space-y-4 border-t border-[#edf1ee] pt-5"><label className="block text-sm font-semibold text-[#3d594e]">Application status<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#dfe8e3] bg-white px-3.5 py-3 text-sm font-normal">{["PENDING", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "REJECTED"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label className="block text-sm font-semibold text-[#3d594e]">Internal review notes<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} maxLength={4000} rows={3} className="mt-1.5 w-full rounded-xl border border-[#dfe8e3] bg-white px-3.5 py-3 text-sm font-normal" /></label>{error && <ErrorBanner message={error} />}<button type="submit" disabled={reviewSaving} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${isAdmin ? "bg-[#293d35] hover:bg-[#526b55]" : "bg-[#246b4b] hover:bg-[#1d5c40]"}`}>{reviewSaving ? "Saving…" : "Save review"}</button></form></section></div>}
      {notice && <div role="status" className="fixed bottom-20 right-4 z-40 rounded-xl bg-[#183a31] px-4 py-3 text-sm font-semibold text-white shadow-xl lg:bottom-5">{notice}<button onClick={() => setNotice(null)} className="ml-4 text-white/70" aria-label="Dismiss notification">×</button></div>}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{message}</div>;
}

function NavIcon({ name, active = false }: { name: string; active?: boolean }) {
  const symbols: Record<string, string> = {
    dashboard: "⌂", children: "◉", parents: "♧", staff: "♙", users: "♙", classrooms: "▦",
    attendance: "✓", activities: "✦", meals: "◒", invoices: "▤", plans: "◇", reports: "▥",
    admissions: "＋", health: "♡", calendar: "▦", documents: "▤", messages: "✉", incidents: "!",
  };
  return <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center text-base leading-none ${active ? "text-[#286b4d]" : ""}`}>{symbols[name] ?? "•"}</span>;
}
