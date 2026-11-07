"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { categoriesFor, categoryLabel, displayBody, displayTitle, safeLink, type NotificationRow, type PortalKind } from "./lib";
import { useNotifications } from "./useNotifications";
import { NotificationCard } from "./NotificationCard";

export function NotificationCenter({ portal = "admin" }: { portal?: PortalKind } = {}) {
  const router = useRouter();
  const s = useNotifications();
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleMarkRead(id: string) {
    try {
      setActionError(null);
      await s.markRead(id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not mark as read.");
    }
  }

  async function openAndNavigate(n: NotificationRow) {
    // Click → mark read (idempotent) then navigate to the exact safe resource.
    if (!n.readAt) {
      try {
        await s.markRead(n.id);
      } catch {
        // Navigation still proceeds; inbox shows the error.
      }
    }
    router.push(safeLink(n.link, portal));
  }

  async function handleMarkAll() {
    try {
      setActionError(null);
      await s.markAll();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not mark all as read.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#edf2ea] px-3 py-1 text-xs font-bold text-[#526b55]">{s.total} total · {s.unread} unread</span>
        <button type="button" onClick={() => void handleMarkAll()} className="rounded-full bg-[#293d35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#526b55]">Mark all as read</button>
        <button type="button" onClick={() => void s.load()} className="rounded-full border border-[#d7d9cd] bg-white px-4 py-2 text-sm font-semibold text-[#526b55]">Refresh</button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Filter by read status" className="flex rounded-full border border-[#e8e6dc] bg-white p-1">
          {(["all", "unread", "read"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={s.status === v} onClick={() => { s.setStatus(v); s.setPage(1); }} className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${s.status === v ? "bg-[#293d35] text-white" : "text-[#526b55]"}`}>
              {v === "all" ? "All" : v === "unread" ? "Unread" : "Read"}
            </button>
          ))}
        </div>
        <label className="text-sm font-semibold text-[#526b55]">
          Category
          <select aria-label="Filter by category" value={s.type} onChange={(e) => { s.setType(e.target.value); s.setPage(1); }} className="ml-2 rounded-xl border border-[#e8e6dc] bg-white px-3 py-2 text-sm font-normal">
            {categoriesFor(portal).map((c) => (
              <option key={c.value || "all"} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[#526b55]">
          Search
          <input aria-label="Search notifications" type="search" value={s.q} onChange={(e) => { s.setQ(e.target.value); s.setPage(1); }} placeholder="Title or message" className="ml-2 rounded-xl border border-[#e8e6dc] bg-white px-3 py-2 text-sm font-normal" />
        </label>
      </div>

      {(s.error || actionError) && (
        <div role="alert" className="rounded-2xl border border-[#f1d2cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b5548]">
          {s.error ?? actionError}{" "}
          <button type="button" onClick={() => void s.load()} className="ml-2 font-bold underline">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-[24px] border border-[#e8e6dc] bg-white shadow-[0_12px_35px_rgba(41,61,53,0.045)]">
        {s.loading ? (
          <p className="p-8 text-center text-sm text-[#87958e]" role="status">Loading notifications…</p>
        ) : s.items.length === 0 ? (
          <p className="p-12 text-center">
            <span className="block text-base font-semibold text-[#293d35]">No notifications</span>
            <span className="mt-1 block text-xs text-[#8a9891]">{s.status === "unread" ? "You are all caught up." : "History will appear here."}</span>
          </p>
        ) : (
          <ul className="divide-y divide-[#eff2f0]">
            {s.items.map((n) => (
              <li key={n.id}>
                <NotificationCard n={n} portal={portal} onMarkRead={(id) => void handleMarkRead(id)} onOpen={(row) => void openAndNavigate(row)} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-[#eff2f0] px-5 py-3 text-xs text-[#8a9891]">
          <span>{s.total} record(s) · Page {s.page}/{s.totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={s.page <= 1} onClick={() => s.setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#e8e6dc] px-3 py-1.5 font-semibold disabled:opacity-50">Previous</button>
            <button type="button" disabled={s.page >= s.totalPages} onClick={() => s.setPage((p) => p + 1)} className="rounded-lg border border-[#e8e6dc] px-3 py-1.5 font-semibold disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-modal="true" aria-label="Notification details" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-t-[24px] bg-white p-6 sm:rounded-[24px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-[#293d35]">{displayTitle(selected)}</h2>
              <button type="button" aria-label="Close details" onClick={() => setSelected(null)} className="rounded-full border border-[#e8e6dc] px-3 py-1 text-sm font-bold">×</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#64776d]">{displayBody(selected)}</p>
            <dl className="mt-4 space-y-1 text-xs text-[#8a9891]">
              <div className="flex justify-between"><dt>Category</dt><dd className="font-bold text-[#526b55]">{categoryLabel(selected.type, portal)}</dd></div>
              <div className="flex justify-between"><dt>Created</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Status</dt><dd>{selected.readAt ? "Read" : "Unread"}</dd></div>
            </dl>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void openAndNavigate(selected)} className="rounded-full bg-[#293d35] px-4 py-2 text-sm font-semibold text-white">Open related page</button>
              {!selected.readAt && <button type="button" onClick={() => void handleMarkRead(selected.id)} className="rounded-full border border-[#e8e6dc] px-4 py-2 text-sm font-semibold">Mark read</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
