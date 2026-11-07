"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, getPageItems } from "../lib/api";

type Portal = "admin" | "parent" | "staff" | "teacher";

type ChildRow = {
  id: string;
  firstName: string;
  lastName: string;
  classroomId?: string | null;
  classroom?: { id: string; name: string } | null;
  status?: string;
};

type AttendanceRow = {
  id: string;
  childId: string;
  childName: string;
  date: string;
  status: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  notes?: string | null;
  checkedInBy?: string | null;
  checkedOutBy?: string | null;
};

type ClassroomRow = { id: string; name: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export function AttendanceManager({ portal }: { portal: Portal }) {
  const isParent = portal === "parent";
  const isAdmin = portal === "admin";
  const canAct = !isParent;

  const [date, setDate] = useState(todayISO());
  const [classroomId, setClassroomId] = useState("");
  const [childId, setChildId] = useState("");
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingKind, setActingKind] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [calendarRows, setCalendarRows] = useState<AttendanceRow[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    const data = await apiRequest<unknown>("/children?page=1&pageSize=100");
    setChildren(getPageItems(data) as ChildRow[]);
  }, []);

  const classrooms = useMemo<ClassroomRow[]>(() => {
    const map = new Map<string, ClassroomRow>();
    for (const c of children) {
      const id = c.classroom?.id ?? c.classroomId;
      const name = c.classroom?.name;
      if (id && name && !map.has(id)) map.set(id, { id, name });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [children]);

  const effectiveChildId = useMemo(() => {
    if (!isParent) return childId;
    if (childId && children.some((c) => c.id === childId)) return childId;
    return children[0]?.id ?? "";
  }, [childId, children, isParent]);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date,
        page: "1",
        pageSize: "100",
      });
      if (classroomId) params.set("classroomId", classroomId);
      if (effectiveChildId) params.set("childId", effectiveChildId);
      const data = await apiRequest<unknown>(`/attendance?${params.toString()}`);
      setRows(getPageItems(data) as AttendanceRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load attendance.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, classroomId, effectiveChildId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadChildren();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadChildren]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAttendance();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAttendance]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ from: date, to: date });
      if (classroomId) params.set("classroomId", classroomId);
      if (effectiveChildId) params.set("childId", effectiveChildId);
      const data = await apiRequest<Record<string, unknown>>(`/attendance/report?${params.toString()}`);
      setReport(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load report.");
    } finally {
      setReportLoading(false);
    }
  }, [date, classroomId, effectiveChildId]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const month = date.slice(0, 7);
      const params = new URLSearchParams({ month });
      if (effectiveChildId) params.set("childId", effectiveChildId);
      const data = await apiRequest<unknown>(`/attendance/calendar?${params.toString()}`);
      setCalendarRows(getPageItems(Array.isArray(data) ? data : []) as AttendanceRow[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load calendar.");
    } finally {
      setCalendarLoading(false);
    }
  }, [date, effectiveChildId]);

  function childName(id: string) {
    const c = children.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : id;
  }

  async function act(kind: "check-in" | "check-out" | "absent", child: ChildRow) {
    if (isParent) return;
    setActingId(child.id);
    setActingKind(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "check-in") {
        await apiRequest("/attendance/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId: child.id }),
        });
      } else if (kind === "check-out") {
        await apiRequest("/attendance/check-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId: child.id }),
        });
      } else {
        await apiRequest("/attendance/absent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ childId: child.id, date, status: "ABSENT" }),
        });
      }
      setNotice(`${child.firstName} ${child.lastName}: ${kind === "check-in" ? "checked in" : kind === "check-out" ? "checked out" : "marked absent"}.`);
      await loadAttendance();
      if (isAdmin) void loadReport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setActingId(null);
      setActingKind(null);
    }
  }

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.status] = (map[r.status] ?? 0) + 1;
    return map;
  }, [rows]);

  // Staff/admin roster: children without attendance record today are implicit "NOT_MARKED"
  const visibleChildren = useMemo(() => {
    let list = children;
    if (classroomId) list = list.filter((c) => (c.classroom?.id ?? c.classroomId) === classroomId);
    if (effectiveChildId && !isParent) list = list.filter((c) => c.id === effectiveChildId);
    if (isParent && effectiveChildId) list = list.filter((c) => c.id === effectiveChildId);
    return list;
  }, [children, classroomId, effectiveChildId, isParent]);

  const rowByChild = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const r of rows) map.set(r.childId, r);
    return map;
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-[#3d594e]">
          Date
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          />
        </label>
        <label className="text-sm font-semibold text-[#3d594e]">
          Classroom
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            className="mt-1 block min-w-[180px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          >
            <option value="">All my classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[#3d594e]">
          Child
          <select
            value={effectiveChildId}
            onChange={(e) => setChildId(e.target.value)}
            className="mt-1 block min-w-[200px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          >
            {isParent ? (
              children.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))
            ) : (
              <>
                <option value="">All accessible children</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </>
            )}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadAttendance()}
          className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e] hover:bg-[#f8faf9]"
        >
          Refresh
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={reportLoading}
              className="rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {reportLoading ? "Loading…" : "Report"}
            </button>
            <button
              type="button"
              onClick={() => void loadCalendar()}
              disabled={calendarLoading}
              className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e] hover:bg-[#f8faf9] disabled:opacity-60"
            >
              {calendarLoading ? "Loading…" : "Calendar"}
            </button>
          </>
        )}
      </div>

      {error && <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-3 text-sm font-medium text-[#293d35]">{notice}</div>}
      {report && isAdmin && (
        <div className="rounded-2xl border border-[#e5ece8] bg-white p-4 text-sm">
          <p className="font-semibold">Attendance report — {String(report.from ?? date)} to {String(report.to ?? date)}</p>
          <p className="mt-1 text-[#64776d]">PRESENT {String((report.totals as Record<string, unknown> | undefined)?.PRESENT ?? 0)} · LATE {String((report.totals as Record<string, unknown> | undefined)?.LATE ?? 0)} · ABSENT {String((report.totals as Record<string, unknown> | undefined)?.ABSENT ?? 0)} · EXCUSED {String((report.totals as Record<string, unknown> | undefined)?.EXCUSED ?? 0)} · Rate {String(report.attendanceRate ?? 0)}%</p>
        </div>
      )}
      {calendarRows.length > 0 && isAdmin && (
        <div className="rounded-2xl border border-[#e5ece8] bg-white p-4">
          <p className="text-sm font-semibold">Calendar — {date.slice(0, 7)}</p>
          <ul className="mt-2 divide-y divide-[#eff2f0] text-sm">
            {calendarRows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{r.childName} — {r.date}</span>
                <span className="font-semibold">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-[#edf2ea] px-3 py-1 text-[#526b55]">PRESENT {totals.PRESENT ?? 0}</span>
        <span className="rounded-full bg-[#faeee8] px-3 py-1 text-[#a66e58]">LATE {totals.LATE ?? 0}</span>
        <span className="rounded-full bg-[#f3f6f4] px-3 py-1 text-[#64776d]">ABSENT {totals.ABSENT ?? 0}</span>
        <span className="rounded-full bg-[#f1edf8] px-3 py-1 text-[#786b9c]">EXCUSED {totals.EXCUSED ?? 0}</span>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#e4ebe7] bg-white shadow-[0_10px_30px_rgba(30,60,46,0.035)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#f8faf9] text-[10px] uppercase tracking-[0.14em] text-[#87958e]">
                <th className="px-5 py-4 font-bold">Child</th>
                <th className="px-5 py-4 font-bold">Classroom</th>
                <th className="px-5 py-4 font-bold">Date</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Check-in</th>
                <th className="px-5 py-4 font-bold">Check-out</th>
                {canAct && <th className="px-5 py-4 font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff2f0]">
              {loading && (
                <tr><td colSpan={canAct ? 7 : 6} className="px-5 py-6 text-center text-sm text-[#87958e]">Loading attendance…</td></tr>
              )}
              {!loading && visibleChildren.length === 0 && (
                <tr><td colSpan={canAct ? 7 : 6} className="px-5 py-16 text-center">
                  <p className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#293d35]">No accessible children</p>
                  <p className="mt-1 text-xs text-[#8a9891]">{isParent ? "No linked children found for your account." : "You have no assigned children for this selection."}</p>
                </td></tr>
              )}
              {!loading && visibleChildren.map((child) => {
                const rec = rowByChild.get(child.id);
                const status = rec?.status ?? "NOT_MARKED";
                const busy = actingId === child.id;
                return (
                  <tr key={child.id} className="hover:bg-[#fbfdfb]">
                    <td className="px-5 py-4 font-semibold">{child.firstName} {child.lastName}</td>
                    <td className="px-5 py-4 text-[#536860]">{child.classroom?.name ?? "—"}</td>
                    <td className="px-5 py-4 text-[#536860]">{date}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${status === "PRESENT" ? "bg-[#edf2ea] text-[#526b55]" : status === "LATE" ? "bg-[#faeee8] text-[#a66e58]" : status === "ABSENT" ? "bg-[#f3f6f4] text-[#64776d]" : status === "EXCUSED" ? "bg-[#f1edf8] text-[#786b9c]" : "bg-[#fdf6e3] text-[#8a6d2b]"}`}>{status.replaceAll("_", " ")}</span>
                    </td>
                    <td className="px-5 py-4 text-[#536860]">{toDisplayDate(rec?.checkInAt)}</td>
                    <td className="px-5 py-4 text-[#536860]">{toDisplayDate(rec?.checkOutAt)}</td>
                    {canAct && (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act("check-in", child)}
                            className="rounded-lg bg-[#293d35] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          >{busy && actingKind === "check-in" ? "…" : "Check-in"}</button>
                          <button
                            type="button"
                            disabled={busy || !rec?.checkInAt}
                            onClick={() => void act("check-out", child)}
                            className="rounded-lg border border-[#dfe9e3] px-3 py-2 text-xs font-semibold disabled:opacity-60"
                          >{busy && actingKind === "check-out" ? "…" : "Check-out"}</button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act("absent", child)}
                            className="rounded-lg border border-[#dfe9e3] px-3 py-2 text-xs font-semibold disabled:opacity-60"
                          >{busy && actingKind === "absent" ? "…" : "Mark absent"}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && visibleChildren.filter((c) => !rowByChild.has(c.id)).length > 0 && (
          <p className="border-t border-[#eff2f0] px-5 py-3 text-xs text-[#8a9891]">Children without a record for {date} are shown as NOT_MARKED until staff act.</p>
        )}
      </section>

      {isParent && (
        <p className="text-xs text-[#8a9891]">Read-only: attendance is recorded by nursery staff. {childName(effectiveChildId || children[0]?.id || "")} — {rows.length} record(s) loaded.</p>
      )}
    </div>
  );
}
