"use client";

import Link from "next/link";
import { categoryIcon, categoryLabel, displayBody, displayTitle, relativeTime, safeLink, type NotificationRow, type PortalKind } from "./lib";

export function NotificationCard({ n, portal = "admin", onMarkRead, onOpen }: { n: NotificationRow; portal?: PortalKind; onMarkRead: (id: string) => void; onOpen: (n: NotificationRow) => void }) {
  const read = !!n.readAt;
  return (
    <article className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${read ? "" : "bg-[#f6faf7]"}`} aria-label={n.title}>
      <div className="flex min-w-0 flex-1 gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf2ea] text-sm text-[#526b55]">
          {categoryIcon(n.type, portal)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#293d35]">
            <button type="button" onClick={() => onOpen(n)} className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#788f75] rounded">
              {displayTitle(n)}
            </button>
            <span className="ml-2 rounded-full bg-[#f3f6f4] px-2 py-0.5 text-[10px] font-bold text-[#64776d]">{categoryLabel(n.type, portal)}</span>
            {read ? null : <span className="ml-2 rounded-full bg-[#293d35] px-2 py-0.5 text-[10px] font-bold text-white">UNREAD</span>}
          </p>
          <p className="mt-1 text-sm text-[#64776d]">{displayBody(n)}</p>
          <p className="mt-1 text-xs text-[#8a9891]">{relativeTime(n.createdAt)} · {new Date(n.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={safeLink(n.link, portal)} className="rounded-lg border border-[#e8e6dc] bg-white px-3 py-1.5 text-xs font-semibold text-[#526b55] hover:bg-[#f7f3e9]">Open</Link>
        {!read && (
          <button type="button" onClick={() => onMarkRead(n.id)} className="rounded-lg bg-[#293d35] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#526b55]">Mark read</button>
        )}
      </div>
    </article>
  );
}
