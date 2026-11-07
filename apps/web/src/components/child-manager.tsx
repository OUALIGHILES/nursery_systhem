"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiRequest, getPageItems } from "../lib/api";
import { ChildProfile } from "./child-profile";

type Portal = "admin" | "parent" | "staff" | "teacher";

export type ChildSummary = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  status: string;
  classroom?: { id: string; name: string } | null;
  parents?: string[];
};

type PageResult = { items: ChildSummary[]; total: number; page: number; pageSize: number; totalPages: number };

export function buildChildrenQuery(opts: {
  q: string;
  classroomId: string;
  status: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    page: String(opts.page),
    pageSize: String(opts.pageSize),
  });
  if (opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.classroomId) params.set("classroomId", opts.classroomId);
  if (opts.status) params.set("status", opts.status);
  return params.toString();
}

function formatDOB(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export function ChildManager({ portal }: { portal: Portal }) {
  const isParent = portal === "parent";
  const isAdmin = portal === "admin";
  const canCreate = isAdmin;
  const canEdit = isAdmin;

  const [q, setQ] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [classroomSaving, setClassroomSaving] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [parentOptions, setParentOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildChildrenQuery({ q, classroomId, status, page, pageSize: 20 });
      const data = (await apiRequest<PageResult>(`/children?${qs}`)) as PageResult & { items?: ChildSummary[] };
      const items = Array.isArray((data as PageResult).items) ? (data as PageResult).items : (getPageItems(data) as ChildSummary[]);
      setResult({
        items,
        total: typeof (data as PageResult).total === "number" ? (data as PageResult).total : items.length,
        page: typeof (data as PageResult).page === "number" ? (data as PageResult).page : page,
        pageSize: 20,
        totalPages: typeof (data as PageResult).totalPages === "number" ? (data as PageResult).totalPages : 1,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load children.");
      setResult({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [q, classroomId, status, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const classrooms = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of result.items) {
      if (c.classroom?.id && c.classroom.name) map.set(c.classroom.id, c.classroom.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [result.items]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void apiRequest<unknown>("/parents?page=1&pageSize=100")
      .then((data) => {
        if (!active) return;
        const items = getPageItems(data) as Array<Record<string, unknown>>;
        setParentOptions(items.map((p) => {
          const user = (p.user ?? p) as Record<string, unknown>;
          const id = String(p.id ?? "");
          const name = `${String(user.firstName ?? "")} ${String(user.lastName ?? "")}`.trim() || id;
          const email = String(user.email ?? "");
          return { id, name, email };
        }));
      })
      .catch(() => {
        if (active) setParentOptions([]);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      dateOfBirth: String(form.get("dateOfBirth") ?? "").trim(),
      gender: String(form.get("gender") ?? ""),
    };
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest("/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setNotice("Child created successfully.");
      setCreateOpen(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not create child.");
    } finally {
      setSaving(false);
    }
  }

  if (selectedId) {
    const handleEdit = () => setEditOpen(true);
    const handleAssign = async (classroomId: string | null) => {
      setClassroomSaving(true);
      setClassroomError(null);
      try {
        await apiRequest(`/children/${selectedId}/classroom`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classroomId }) });
        await load();
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Assign failed.";
        setClassroomError(msg);
        throw new Error(msg);
      } finally {
        setClassroomSaving(false);
      }
    };
    const handleLink = async (parentId: string, relation: string, isPrimary: boolean) => {
      setLinkError(null);
      try {
        await apiRequest(`/children/${selectedId}/parents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, relation, isPrimary }) });
        await load();
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Link failed.";
        setLinkError(msg);
        throw new Error(msg);
      }
    };
    const handleUnlink = async (parentId: string) => {
      try {
        await apiRequest(`/children/${selectedId}/parents/${parentId}`, { method: "DELETE" });
        await load();
      } catch (cause) {
        const msg = cause instanceof Error ? cause.message : "Unlink failed.";
        setLinkError(msg);
        throw new Error(msg);
      }
    };
    return <ChildProfile childId={selectedId} onBack={() => setSelectedId(null)} onEdit={handleEdit} onAssign={handleAssign} onLink={handleLink} onUnlink={handleUnlink} portal={portal} canManage={canEdit} classroomOptions={classrooms} parentOptions={parentOptions} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-[#3d594e]">
          Search
          <input
            type="search"
            aria-label="Search children"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name…"
            className="mt-1 block min-w-[200px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          />
        </label>
        <label className="text-sm font-semibold text-[#3d594e]">
          Classroom
          <select
            value={classroomId}
            onChange={(e) => {
              setClassroomId(e.target.value);
              setPage(1);
            }}
            className="mt-1 block min-w-[180px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          >
            <option value="">All classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[#3d594e]">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="mt-1 block min-w-[140px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e] hover:bg-[#f8faf9]"
        >
          Refresh
        </button>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
            className="ml-auto rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#526b55]"
          >
            Add Child
          </button>
        )}
      </div>

      {error && <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-3 text-sm font-medium text-[#293d35]">{notice}</div>}

      <section className="overflow-hidden rounded-[24px] border border-[#e4ebe7] bg-white shadow-[0_10px_30px_rgba(30,60,46,0.035)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#f8faf9] text-[10px] uppercase tracking-[0.14em] text-[#87958e]">
                <th className="px-5 py-4 font-bold">First name</th>
                <th className="px-5 py-4 font-bold">Last name</th>
                <th className="px-5 py-4 font-bold">Date of birth</th>
                <th className="px-5 py-4 font-bold">Gender</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Classroom</th>
                <th className="px-5 py-4 font-bold">Parent names</th>
                <th className="px-5 py-4 font-bold">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff2f0]">
              {loading && (
                <tr><td colSpan={8} className="px-5 py-6 text-center text-sm text-[#87958e]">Loading children…</td></tr>
              )}
              {!loading && result.items.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-16 text-center">
                  <p className="font-[family-name:var(--font-heading)] text-base font-semibold text-[#293d35]">No children found</p>
                  <p className="mt-1 text-xs text-[#8a9891]">{isParent ? "No linked children found for your account." : "Try a different search or filter."}</p>
                </td></tr>
              )}
              {!loading && result.items.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-[#fbfdfb]" onClick={() => setSelectedId(c.id)}>
                  <td className="px-5 py-4 font-semibold">{c.firstName}</td>
                  <td className="px-5 py-4 font-semibold">{c.lastName}</td>
                  <td className="px-5 py-4 text-[#536860]">{formatDOB(c.dateOfBirth)}</td>
                  <td className="px-5 py-4 text-[#536860]">{c.gender}</td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${c.status === "ACTIVE" ? "bg-[#edf2ea] text-[#526b55]" : "bg-[#f3f6f4] text-[#64776d]"}`}>{c.status}</span></td>
                  <td className="px-5 py-4 text-[#536860]">{c.classroom?.name ?? "—"}</td>
                  <td className="px-5 py-4 text-[#536860]">{Array.isArray(c.parents) && c.parents.length > 0 ? c.parents.join(", ") : "—"}</td>
                  <td className="px-5 py-4"><button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 text-xs font-semibold">View Profile</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eff2f0] px-5 py-3 text-xs text-[#8a9891]">
          <span>{result.total} record(s) · Page {result.page}/{result.totalPages || 1}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 font-semibold disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= (result.totalPages || 1)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 font-semibold disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>

      {isParent && <p className="text-xs text-[#8a9891]">Read-only: only your linked children are shown.</p>}
      {!isParent && !isAdmin && <p className="text-xs text-[#8a9891]">Read-only: only children in your assigned classrooms are shown.</p>}

      {createOpen && canCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#10231e]/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-child-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5d8678]">New record</p><h2 id="add-child-title" className="mt-1 text-2xl font-black">Add child</h2></div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close dialog" className="grid size-9 place-items-center rounded-xl bg-[#f2f6f3] text-[#52675e]">×</button>
            </div>
            <form onSubmit={(e) => void submitCreate(e)} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-[#3d594e]">First name<input name="firstName" required minLength={2} maxLength={80} className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]" /></label>
              <label className="block text-sm font-semibold text-[#3d594e]">Last name<input name="lastName" required minLength={2} maxLength={80} className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]" /></label>
              <label className="block text-sm font-semibold text-[#3d594e]">Date of birth<input name="dateOfBirth" required type="date" className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]" /></label>
              <label className="block text-sm font-semibold text-[#3d594e]">Gender<select name="gender" required className="mt-2 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3.5 py-3 text-sm outline-none focus:border-[#82b797]"><option value="PREFER_NOT_TO_SAY">PREFER_NOT_TO_SAY</option><option value="FEMALE">FEMALE</option><option value="MALE">MALE</option><option value="OTHER">OTHER</option></select></label>
              {formError && <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{formError}</div>}
              <button disabled={saving} type="submit" className="w-full rounded-xl bg-[#293d35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#526b55] disabled:opacity-60">{saving ? "Saving…" : "Create child"}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
