"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, getPageItems, isRecord } from "../lib/api";

type Portal = "admin" | "parent" | "staff" | "teacher";
type ChildRow = { id: string; firstName: string; lastName: string; classroomId?: string | null; classroom?: { id: string; name: string } | null };
type ActivityRow = { id: string; title: string; description?: string | null; scheduledAt?: string | null; durationMin?: number | null; classroomId?: string | null; participations?: Array<{ status: string; notes?: string | null; childId?: string }> };
type MealRow = { id: string; date: string; mealType: string; name: string; description?: string | null; allergens?: string[] | null; classroomId?: string | null };
type RecordRow = { id: string; consumption: string; notes?: string | null; meal: { id: string; date: string; mealType: string; name: string; allergens?: string[] | null } };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(value: string | null | undefined) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(); }

export function DailyReport({ portal }: { portal: Portal }) {
  const isParent = portal === "parent";
  const canEdit = !isParent;
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childId, setChildId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    const data = await apiRequest<unknown>("/children?page=1&pageSize=100");
    setChildren(getPageItems(data) as ChildRow[]);
  }, []);

  useEffect(() => { const t = window.setTimeout(() => { void loadChildren(); }, 0); return () => window.clearTimeout(t); }, [loadChildren]);

  const effectiveChildId = useMemo(() => childId || children[0]?.id || "", [childId, children]);

  const load = useCallback(async () => {
    if (!effectiveChildId) return;
    setLoading(true);
    setError(null);
    try {
      const [acts, mealsData, history, allergyData] = await Promise.all([
        apiRequest<unknown>(`/activities?date=${date}&page=1&pageSize=50`),
        apiRequest<unknown>(`/meals?date=${date}&page=1&pageSize=50`),
        apiRequest<unknown>(`/meals/child/${effectiveChildId}`),
        apiRequest<unknown>(`/health/allergies?childId=${effectiveChildId}`),
      ]);
      setActivities(getPageItems(acts) as ActivityRow[]);
      setMeals(getPageItems(mealsData) as MealRow[]);
      const allHistory = Array.isArray(history) ? history.filter(isRecord) : getPageItems(Array.isArray(history) ? history : []);
      setRecords(allHistory.filter((r) => String((r as Record<string, unknown>).meal ? ((r as Record<string, unknown>) as { meal: { date: string } }).meal.date : "").slice(0, 10) === date) as RecordRow[]);
      setAllergies(Array.isArray(allergyData) ? (allergyData as Array<Record<string, unknown>>).map((a) => String(a.allergen ?? "")).filter(Boolean) : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load daily report.");
    } finally {
      setLoading(false);
    }
  }, [date, effectiveChildId]);

  useEffect(() => { const t = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(t); }, [load]);

  async function act(kind: string, fn: () => Promise<unknown>) {
    if (isParent) return;
    setSaving(kind);
    setError(null);
    try { await fn(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); } finally { setSaving(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-[#3d594e]">Child<select value={effectiveChildId} onChange={(e) => setChildId(e.target.value)} className="mt-1 block min-w-[200px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]">{children.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
        <label className="text-sm font-semibold text-[#3d594e]">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e]">Refresh</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{error}</div>}
      {allergies.length > 0 && <div role="note" className="rounded-xl border border-[#f3d5a5] bg-[#fff8ed] px-4 py-3 text-sm text-[#8a6d2b]">⚠ Allergies on file: {allergies.join(", ")} — verify meal ingredients before serving.</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Activities — {date}</h3>
          {loading ? <p className="mt-4 text-sm text-[#87958e]">Loading…</p> : activities.length ? (
            <ul className="mt-3 divide-y divide-[#eff2f0] text-sm">{activities.map((a) => <li key={a.id} className="py-2"><p className="font-semibold">{a.title}</p><p className="text-xs text-[#64776d]">{a.description ?? ""} · {a.scheduledAt ? fmtDate(a.scheduledAt) : ""}{a.durationMin ? ` · ${a.durationMin} min` : ""}</p></li>)}</ul>
          ) : <p className="mt-3 text-sm text-[#8a9891]">No activities today.</p>}
          {canEdit && (
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void act("activity", () => apiRequest("/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: String(f.get("title")), description: String(f.get("desc") || ""), scheduledAt: `${date}T09:00:00Z`, classroomId: children.find((c) => c.id === effectiveChildId)?.classroom?.id ?? children.find((c) => c.id === effectiveChildId)?.classroomId ?? undefined }) })); }} className="mt-4 flex gap-2 border-t border-[#eff2f0] pt-4">
              <input name="title" required minLength={2} maxLength={160} placeholder="Activity title" className="flex-1 rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm" />
              <input name="desc" placeholder="Observation" maxLength={4000} className="flex-1 rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm" />
              <button disabled={saving === "activity"} type="submit" className="rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving === "activity" ? "…" : "Add"}</button>
            </form>
          )}
        </section>
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Meals — {date}</h3>
          {loading ? <p className="mt-4 text-sm text-[#87958e]">Loading…</p> : meals.length ? (
            <ul className="mt-3 divide-y divide-[#eff2f0] text-sm">{meals.map((m) => {
              const rec = records.find((r) => r.meal.id === m.id);
              const conflict = allergies.some((a) => (m.allergens ?? []).some((x) => x.toLowerCase().includes(a.toLowerCase())));
              return <li key={m.id} className="py-2"><p className="font-semibold">{m.name} ({m.mealType}) {conflict ? <span className="ml-2 rounded-full bg-[#faeee8] px-2 py-0.5 text-[10px] font-bold text-[#a66e58]">ALLERGY CHECK</span> : null}</p><p className="text-xs text-[#64776d]">{m.description ?? ""} · {rec ? `Consumption: ${rec.consumption}` : "No consumption recorded"}</p>{canEdit && <div className="mt-2 flex gap-2">{(["ALL", "PARTIAL", "NONE"] as const).map((c) => <button key={c} type="button" disabled={saving === m.id} onClick={() => void act(m.id, () => apiRequest(`/meals/${m.id}/records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId: effectiveChildId, consumption: c }) }))} className="rounded-lg border border-[#dfe9e3] px-2.5 py-1 text-xs font-semibold disabled:opacity-60">{c === "ALL" ? "Full" : c === "PARTIAL" ? "Partial" : "None"}</button>)}</div>}</li>;
            })}</ul>
          ) : <p className="mt-3 text-sm text-[#8a9891]">No meals today.</p>}
          {canEdit && (
            <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void act("meal", () => apiRequest("/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, mealType: String(f.get("mealType")), name: String(f.get("name")), description: String(f.get("desc") || ""), allergens: [] }) })); }} className="mt-4 flex flex-wrap gap-2 border-t border-[#eff2f0] pt-4">
              <select name="mealType" required className="rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm"><option>BREAKFAST</option><option>LUNCH</option><option>SNACK_MORNING</option><option>SNACK_AFTERNOON</option></select>
              <input name="name" required minLength={2} maxLength={160} placeholder="Meal name" className="flex-1 min-w-[140px] rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm" />
              <input name="desc" placeholder="Description" maxLength={2000} className="flex-1 min-w-[140px] rounded-xl border border-[#dfe9e3] px-3 py-2 text-sm" />
              <button disabled={saving === "meal"} type="submit" className="rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving === "meal" ? "…" : "Add meal"}</button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
