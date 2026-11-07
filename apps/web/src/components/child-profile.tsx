"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { apiRequest, isRecord } from "../lib/api";

export type ChildDetail = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  status: string;
  photoUrl?: string | null;
  medicalNotes?: string | null;
  bloodType?: string | null;
  classroom?: { id: string; name: string; program: string; capacity?: number } | null;
  parents?: Array<{
    parentId?: string;
    userId?: string;
    relation: string;
    isPrimary?: boolean;
    canPickup?: boolean;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string | null;
    address?: string | null;
  }>;
  allergies?: Array<{ id: string; allergen: string; severity: string; notes?: string | null }>;
  authorizedPickups?: Array<{ id: string; fullName: string; relation: string; phone: string; isActive?: boolean }>;
};

export type ChildProfile = ChildDetail & {
  attendances?: Array<{ id: string; date: string; status: string; checkInAt?: string | null; checkOutAt?: string | null }>;
  mealRecords?: Array<{ id: string; consumption: string; notes?: string | null; meal: { id: string; date: string; mealType: string; name: string } }>;
  participations?: Array<{ id: string; status: string; notes?: string | null; activity: { id: string; title: string; scheduledAt?: string | null } }>;
  medicationRecords?: Array<{ id: string; medication: string; dosage: string; administeredAt: string; administeredBy?: string | null; notes?: string | null }>;
  incidents?: Array<{ id: string; type: string; severity: string; occurredAt: string; actionTaken?: string | null }>;
  documents?: unknown[];
};

export type Pickup = { id: string; fullName: string; relation: string; phone: string; isActive?: boolean };

export function pickupErrorMessage(message: string) {
  if (/403|forbidden|do not have access/i.test(message)) return "You do not have permission to modify pickups for this child.";
  if (/404|not found/i.test(message)) return "Child or pickup not found.";
  return message;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function ChildProfile({ childId, onBack, onEdit, onAssign, onLink, onUnlink, portal, canManage = false, classroomOptions, parentOptions }: {
  childId: string;
  onBack: () => void;
  onEdit?: () => void;
  onAssign?: (classroomId: string | null) => Promise<void>;
  onLink?: (parentId: string, relation: string, isPrimary: boolean) => Promise<void>;
  onUnlink?: (parentId: string) => Promise<void>;
  portal?: string;
  canManage?: boolean;
  classroomOptions?: Array<{ id: string; name: string }>;
  parentOptions?: Array<{ id: string; name: string; email: string }>;
}) {
  const [detail, setDetail] = useState<ChildDetail | null>(null);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [pickupSaving, setPickupSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupNotice, setPickupNotice] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [classroomSaving, setClassroomSaving] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [classroomNotice, setClassroomNotice] = useState<string | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [unlinkSaving, setUnlinkSaving] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setForbidden(false);
    try {
      const [d, p] = await Promise.all([
        apiRequest<ChildDetail>(`/children/${childId}`),
        apiRequest<ChildProfile>(`/children/${childId}/profile`),
      ]);
      if (!isRecord(d) || !isRecord(p)) throw new Error("Invalid child data.");
      setDetail(d as ChildDetail);
      setProfile(p as ChildProfile);
      setPickups((p as ChildProfile).authorizedPickups ?? (d as ChildDetail).authorizedPickups ?? []);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Could not load child profile.";
      setError(msg);
      if (/not found/i.test(msg)) setNotFound(true);
      if (/403|forbidden|do not have access/i.test(msg)) setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editSaving) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    const text = (k: string) => String(form.get(k) ?? "").trim();
    if (text("firstName")) payload.firstName = text("firstName");
    if (text("lastName")) payload.lastName = text("lastName");
    if (text("dateOfBirth")) payload.dateOfBirth = text("dateOfBirth");
    if (text("gender")) payload.gender = text("gender");
    if (text("status")) payload.status = text("status");
    if (form.has("medicalNotes")) payload.medicalNotes = text("medicalNotes") || null;
    if (form.has("bloodType")) payload.bloodType = text("bloodType") || null;
    setEditSaving(true);
    setEditError(null);
    setEditNotice(null);
    try {
      await apiRequest(`/children/${childId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setEditNotice("Child updated.");
      await load();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not update child.");
    } finally {
      setEditSaving(false);
    }
  }

  async function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (classroomSaving || !onAssign) return;
    const value = String(new FormData(event.currentTarget).get("classroomId") ?? "");
    setClassroomSaving(true);
    setClassroomError(null);
    setClassroomNotice(null);
    try {
      await onAssign(value || null);
      setClassroomNotice("Classroom updated.");
      await load();
    } catch (cause) {
      setClassroomError(cause instanceof Error ? cause.message : "Assignment failed.");
    } finally {
      setClassroomSaving(false);
    }
  }

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (linkSaving || !onLink) return;
    const form = new FormData(event.currentTarget);
    const parentId = String(form.get("parentId") ?? "");
    const relation = String(form.get("relation") ?? "");
    const isPrimary = form.get("isPrimary") === "on";
    if (!parentId) {
      setLinkError("Select a parent.");
      return;
    }
    setLinkSaving(true);
    setLinkError(null);
    try {
      await onLink(parentId, relation, isPrimary);
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : "Link failed.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function doUnlink(parentId: string) {
    if (!onUnlink || unlinkSaving) return;
    setUnlinkSaving(parentId);
    setLinkError(null);
    try {
      await onUnlink(parentId);
      setConfirmUnlinkId(null);
      await load();
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : "Unlink failed.");
    } finally {
      setUnlinkSaving(null);
    }
  }

  async function doArchive() {
    if (archiving) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await apiRequest(`/children/${childId}/archive`, { method: "POST" });
      onBack();
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : "Archive failed.");
    } finally {
      setArchiving(false);
      setConfirmArchive(false);
    }
  }

  async function addPickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pickupSaving) return;
    const url = `/children/${childId}/pickups`;
    const form = new FormData(event.currentTarget);
    const payload = {
      fullName: String(form.get("fullName") ?? "").trim(),
      relation: String(form.get("relation") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      ...(String(form.get("idDocument") ?? "").trim() ? { idDocument: String(form.get("idDocument")).trim() } : {}),
    };
    if (payload.fullName.length < 2 || payload.fullName.length > 120) {
      setPickupError("Full name must be 2–120 characters.");
      return;
    }
    if (payload.relation.length < 2 || payload.relation.length > 60) {
      setPickupError("Relationship must be 2–60 characters.");
      return;
    }
    if (payload.phone.length < 6 || payload.phone.length > 32) {
      setPickupError("Phone must be 6–32 characters.");
      return;
    }
    if (pickupSaving) return;
    setPickupSaving(true);
    setPickupError(null);
    setPickupNotice(null);
    try {
      const created = (await apiRequest<Pickup>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as Pickup;
      setPickups((current) => [...current, created]);
      setPickupNotice("Pickup person added.");
      event.currentTarget.reset();
    } catch (cause) {
      setPickupError(pickupErrorMessage(cause instanceof Error ? cause.message : "Could not add pickup person."));
    } finally {
      setPickupSaving(false);
    }
  }

  async function removePickup(pickupId: string) {
    if (removingId || pickupSaving) return;
    setRemovingId(pickupId);
    setPickupError(null);
    setPickupNotice(null);
    try {
      await apiRequest(`/children/${childId}/pickups/${pickupId}`, { method: "DELETE" });
      setPickups((current) => current.filter((p) => p.id !== pickupId));
      setPickupNotice("Pickup person removed.");
      setConfirmRemoveId(null);
    } catch (cause) {
      setPickupError(pickupErrorMessage(cause instanceof Error ? cause.message : "Could not remove pickup person."));
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={onBack} className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e]">← Back to Children</button>
        <p className="text-center text-sm text-[#87958e] py-12" role="status">Loading child profile…</p>
      </div>
    );
  }

  if (!detail || !profile) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={onBack} className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e]">← Back to Children</button>
        <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-6 text-center text-sm text-[#9b5548]">
          {forbidden ? "You do not have access to this child." : notFound ? "Child not found." : error ?? "Could not load child profile."}
        </div>
      </div>
    );
  }

  const allergies = profile.allergies ?? detail.allergies ?? [];
  const displayPickups = pickups.length ? pickups : (profile.authorizedPickups ?? detail.authorizedPickups ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e] hover:bg-[#f8faf9]">← Back to Children</button>
        <div className="flex gap-2">
          {canManage && <button type="button" onClick={() => { setEditError(null); setEditNotice(null); }} className="rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white">Edit Child</button>}
          {canManage && <button type="button" onClick={() => setConfirmArchive((v) => !v)} className="rounded-xl border border-[#f1d2cd] bg-white px-4 py-2 text-sm font-semibold text-[#9b5548]">Archive Child</button>}
          <button type="button" onClick={() => void load()} className="rounded-xl border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-semibold text-[#52675e] hover:bg-[#f8faf9]">Refresh</button>
        </div>
      </div>
      {confirmArchive && canManage && (
        <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-4 text-sm text-[#9b5548]">
          <p><strong>Archive {detail.firstName} {detail.lastName}?</strong> This is not permanent deletion — history, attendance, meals, health and billing records are preserved. The child will be hidden from active lists.</p>
          {archiveError && <p className="mt-2">{archiveError}</p>}
          <div className="mt-3 flex gap-2"><button type="button" disabled={archiving} onClick={() => void doArchive()} className="rounded-xl bg-[#9b5548] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{archiving ? "Archiving…" : "Yes, archive"}</button><button type="button" onClick={() => setConfirmArchive(false)} className="rounded-xl border border-[#dfe9e3] px-4 py-2 text-sm font-semibold">Cancel</button></div>
        </div>
      )}

      {canManage && (
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Edit Child</h3>
          {editError && <div role="alert" className="mt-3 rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{editError}</div>}
          {editNotice && <div role="status" className="mt-3 rounded-xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-3 text-sm font-medium text-[#293d35]">{editNotice}</div>}
          <form onSubmit={(e) => void submitEdit(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#3d594e]">First name<input name="firstName" defaultValue={detail.firstName} minLength={2} maxLength={80} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
            <label className="text-sm font-semibold text-[#3d594e]">Last name<input name="lastName" defaultValue={detail.lastName} minLength={2} maxLength={80} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
            <label className="text-sm font-semibold text-[#3d594e]">Date of birth<input name="dateOfBirth" type="date" defaultValue={String(detail.dateOfBirth).slice(0, 10)} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
            <label className="text-sm font-semibold text-[#3d594e]">Gender<select name="gender" defaultValue={detail.gender} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"><option>PREFER_NOT_TO_SAY</option><option>MALE</option><option>FEMALE</option><option>OTHER</option></select></label>
            <label className="text-sm font-semibold text-[#3d594e]">Status<select name="status" defaultValue={detail.status} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"><option>ACTIVE</option><option>ARCHIVED</option></select></label>
            <label className="text-sm font-semibold text-[#3d594e]">Blood type<input name="bloodType" defaultValue={detail.bloodType ?? ""} maxLength={8} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
            <label className="text-sm font-semibold text-[#3d594e] sm:col-span-2">Medical notes<textarea name="medicalNotes" defaultValue={detail.medicalNotes ?? ""} maxLength={4000} rows={2} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]" /></label>
            <div className="sm:col-span-2"><button type="submit" disabled={editSaving} className="rounded-xl bg-[#293d35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{editSaving ? "Saving…" : "Save changes"}</button></div>
          </form>
        </section>
      )}

      {canManage && onAssign && (
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Assign Classroom</h3>
          {classroomError && <div role="alert" className="mt-3 rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{classroomError}</div>}
          {classroomNotice && <div role="status" className="mt-3 rounded-xl border border-[#d7e8d9] bg-[#f2f8f0] px-4 py-3 text-sm font-medium text-[#293d35]">{classroomNotice}</div>}
          <form onSubmit={(e) => void submitAssign(e)} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-[#3d594e]">Classroom<select name="classroomId" defaultValue={detail.classroom?.id ?? ""} className="mt-1 block min-w-[200px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"><option value="">Unassigned</option>{(classroomOptions ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button type="submit" disabled={classroomSaving} className="rounded-xl bg-[#293d35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{classroomSaving ? "Assigning…" : "Assign"}</button>
          </form>
        </section>
      )}

      {error && <div role="alert" className="rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{error}</div>}

      <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start gap-5">
          {detail.photoUrl ? (
            <div className="relative size-20 overflow-hidden rounded-2xl bg-[#edf2ea] shrink-0">
              <Image src={detail.photoUrl} alt={`${detail.firstName} ${detail.lastName} photo`} fill unoptimized sizes="80px" className="object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-[-0.04em] text-[#293d35]">{detail.firstName} {detail.lastName}</h2>
            <p className="mt-1 text-sm text-[#747c72]">{detail.status} · {fmtDate(detail.dateOfBirth)} · {detail.gender}</p>
            {detail.bloodType || detail.medicalNotes ? (
              <p className="mt-2 text-xs text-[#8a9891]">{detail.bloodType ? `Blood type: ${detail.bloodType}` : ""}{detail.medicalNotes ? ` · ${detail.medicalNotes}` : ""}</p>
            ) : null}
          </div>
          <span className={`inline-flex rounded-full px-3 py-1.5 text-[11px] font-bold ${detail.status === "ACTIVE" ? "bg-[#edf2ea] text-[#526b55]" : "bg-[#f3f6f4] text-[#64776d]"}`}>{detail.status}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Family</h3>
          {linkError && <div role="alert" className="mt-3 rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">{linkError}</div>}
          {Array.isArray(detail.parents) && detail.parents.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#eff2f0]">
              {detail.parents.map((p, i) => {
                const pid = String(p.parentId ?? "");
                const confirming = confirmUnlinkId === pid;
                return (
                  <li key={`${p.parentId ?? p.userId ?? i}`} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-sm font-semibold">{p.firstName} {p.lastName} {p.isPrimary ? <span className="ml-2 rounded-full bg-[#edf2ea] px-2 py-0.5 text-[10px] font-bold text-[#526b55]">PRIMARY</span> : null}</p>
                      <p className="mt-0.5 text-xs text-[#64776d]">{p.relation}{p.email ? ` · ${p.email}` : ""}{p.phone ? ` · ${p.phone}` : ""}</p>
                      {p.address ? <p className="text-xs text-[#8a9891]">{p.address}</p> : null}</div>
                      {canManage && onUnlink && pid ? (
                        confirming ? (
                          <div className="flex items-center gap-2"><span className="text-xs text-[#9b5548]">Unlink?</span><button type="button" disabled={unlinkSaving === pid} onClick={() => void doUnlink(pid)} className="rounded-lg bg-[#9b5548] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{unlinkSaving === pid ? "…" : "Yes"}</button><button type="button" onClick={() => setConfirmUnlinkId(null)} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 text-xs font-semibold">Cancel</button></div>
                        ) : (
                          <button type="button" onClick={() => setConfirmUnlinkId(pid)} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 text-xs font-semibold">Unlink</button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 text-sm text-[#8a9891]">No parents linked.</p>}
          {canManage && onLink && (
            <form onSubmit={(e) => void submitLink(e)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-[#eff2f0] pt-4">
              <label className="text-xs font-semibold text-[#3d594e]">Parent<select name="parentId" required className="mt-1 block min-w-[180px] rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"><option value="">Select parent…</option>{(parentOptions ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}{o.email ? ` (${o.email})` : ""}</option>)}</select></label>
              <label className="text-xs font-semibold text-[#3d594e]">Relation<select name="relation" required className="mt-1 block rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#82b797]"><option>MOTHER</option><option>FATHER</option><option>GUARDIAN</option><option>OTHER</option></select></label>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#3d594e]"><input type="checkbox" name="isPrimary" className="size-4" /> Primary</label>
              <button type="submit" disabled={linkSaving} className="rounded-xl bg-[#293d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{linkSaving ? "Linking…" : "Link parent"}</button>
            </form>
          )}
        </section>

        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Classroom</h3>
          {detail.classroom ? (
            <div className="mt-4">
              <p className="text-base font-semibold">{detail.classroom.name}</p>
              <p className="mt-1 text-sm text-[#64776d]">{detail.classroom.program}{typeof detail.classroom.capacity === "number" ? ` · Capacity ${detail.classroom.capacity}` : ""}</p>
            </div>
          ) : <p className="mt-4 text-sm text-[#8a9891]">No classroom assigned.</p>}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Attendance</h3>
          {(profile.attendances?.length ?? 0) ? (
            <ul className="mt-4 divide-y divide-[#eff2f0] text-sm">
              {profile.attendances?.slice(0, 10).map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{fmtDate(a.date)}</span><span className="font-semibold">{a.status} <span className="font-normal text-[#8a9891]">{fmtDateTime(a.checkInAt)} → {fmtDateTime(a.checkOutAt)}</span></span></li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-[#8a9891]">No attendance records.</p>}
        </section>

        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Meals & Activities</h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-[#8a9891]">MEALS</p>
              {(profile.mealRecords?.length ?? 0) ? (
                <ul className="mt-1 divide-y divide-[#eff2f0] text-sm">
                  {profile.mealRecords?.slice(0, 5).map((m) => (
                    <li key={m.id} className="py-2">{fmtDate(m.meal.date)} — {m.meal.name} ({m.consumption})</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-[#8a9891]">No meal records.</p>}
            </div>
            <div>
              <p className="text-xs font-bold text-[#8a9891]">ACTIVITIES</p>
              {(profile.participations?.length ?? 0) ? (
                <ul className="mt-1 divide-y divide-[#eff2f0] text-sm">
                  {profile.participations?.slice(0, 5).map((p) => (
                    <li key={p.id} className="py-2">{p.activity.title} — {p.status}{p.activity.scheduledAt ? ` · ${fmtDateTime(p.activity.scheduledAt)}` : ""}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-sm text-[#8a9891]">No activity history.</p>}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Health</h3>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-xs font-bold text-[#8a9891]">ALLERGIES</p>
              {allergies.length ? (
                <ul className="mt-1 space-y-1">{allergies.map((a) => <li key={a.id} className="py-1">{a.allergen} ({a.severity}){a.notes ? ` — ${a.notes}` : ""}</li>)}</ul>
              ) : <p className="mt-1 text-[#8a9891]">No allergies recorded.</p>}
            </div>
            <div>
              <p className="text-xs font-bold text-[#8a9891]">MEDICATIONS</p>
              {(profile.medicationRecords?.length ?? 0) ? (
                <ul className="mt-1 divide-y divide-[#eff2f0]">{profile.medicationRecords?.slice(0, 5).map((m) => <li key={m.id} className="py-1.5">{m.medication} {m.dosage} — {fmtDateTime(m.administeredAt)}{m.administeredBy ? ` by ${m.administeredBy}` : ""}</li>)}</ul>
              ) : <p className="mt-1 text-[#8a9891]">No medication records.</p>}
            </div>
            <div>
              <p className="text-xs font-bold text-[#8a9891]">INCIDENTS</p>
              {(profile.incidents?.length ?? 0) ? (
                <ul className="mt-1 divide-y divide-[#eff2f0]">{profile.incidents?.slice(0, 5).map((i) => <li key={i.id} className="py-1.5">{i.type} ({i.severity}) — {fmtDateTime(i.occurredAt)}</li>)}</ul>
              ) : <p className="mt-1 text-[#8a9891]">No incidents.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#e4ebe7] bg-white p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#788f75]">Authorized Pickup Persons</h3>
          {pickupError && <div role="alert" className="mt-3 rounded-xl border border-[#f1d2cd] bg-[#fff7f5] px-3 py-2 text-xs text-[#9b5548]">{pickupError}</div>}
          {pickupNotice && <div role="status" className="mt-3 rounded-xl border border-[#d7e8d9] bg-[#f2f8f0] px-3 py-2 text-xs font-medium text-[#293d35]">{pickupNotice}</div>}
          {displayPickups.length ? (
            <ul className="mt-4 divide-y divide-[#eff2f0] text-sm">
              {displayPickups.map((p) => {
                const busy = removingId === p.id;
                const confirming = confirmRemoveId === p.id;
                return (
                  <li key={p.id} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{p.fullName} <span className="ml-2 font-normal text-[#64776d]">{p.relation}</span></p>
                        <p className="text-xs text-[#64776d]">{p.phone}{typeof p.isActive === "boolean" ? ` · ${p.isActive ? "Active" : "Inactive"}` : ""}</p>
                      </div>
                      {confirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#9b5548]">Remove?</span>
                          <button type="button" disabled={busy} onClick={() => void removePickup(p.id)} className="rounded-lg bg-[#9b5548] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busy ? "…" : "Yes, remove"}</button>
                          <button type="button" onClick={() => setConfirmRemoveId(null)} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 text-xs font-semibold">Cancel</button>
                        </div>
                      ) : (
                        <button type="button" disabled={busy || pickupSaving} onClick={() => setConfirmRemoveId(p.id)} className="rounded-lg border border-[#dfe9e3] px-3 py-1.5 text-xs font-semibold disabled:opacity-60">Remove</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 text-sm text-[#8a9891]">No authorized pickup persons.</p>}

          <form onSubmit={(e) => void addPickup(e)} className="mt-5 space-y-3 border-t border-[#eff2f0] pt-4">
            <p className="text-xs font-bold text-[#8a9891]">ADD PICKUP PERSON</p>
            <label className="block text-xs font-semibold text-[#3d594e]">Full name<input name="fullName" required minLength={2} maxLength={120} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm outline-none focus:border-[#82b797]" /></label>
            <label className="block text-xs font-semibold text-[#3d594e]">Relationship<input name="relation" required minLength={2} maxLength={60} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm outline-none focus:border-[#82b797]" /></label>
            <label className="block text-xs font-semibold text-[#3d594e]">Phone<input name="phone" required minLength={6} maxLength={32} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm outline-none focus:border-[#82b797]" /></label>
            <label className="block text-xs font-semibold text-[#3d594e]">ID document (optional)<input name="idDocument" maxLength={120} className="mt-1 w-full rounded-xl border border-[#dfe9e3] bg-[#fbfdfb] px-3 py-2 text-sm outline-none focus:border-[#82b797]" /></label>
            <button type="submit" disabled={pickupSaving} className="w-full rounded-xl bg-[#293d35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pickupSaving ? "Adding…" : "Add pickup person"}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
