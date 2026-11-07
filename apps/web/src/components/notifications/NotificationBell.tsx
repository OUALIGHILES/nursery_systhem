"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, getPageItems } from "../../lib/api";
import { useSocket } from "../../app/chat/hooks/use-socket";
import { CHAT_SERVER_EVENTS } from "../../app/chat/socket-events";
import { isInboxNotification, isNewUnread, safeLink } from "./lib";
import type { NotificationRow } from "./lib";

export function NotificationBell({ portal = "admin" }: { portal?: "admin" | "parent" } = {}) {
  const router = useRouter();
  const { socket } = useSocket();
  const [unread, setUnread] = useState(0);
  const [recent, setRecent] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  async function openNotification(n: NotificationRow) {
    // Click → mark read once, clear from bell, then open the exact related resource.
    if (!n.readAt) {
      try {
        await apiRequest(`/notifications/${n.id}/read`, { method: "PATCH" });
        setUnread((c) => Math.max(0, c - 1));
        setRecent((cur) => cur.filter((x) => x.id !== n.id));
      } catch {
        // Still navigate; inbox remains the source of truth.
      }
    }
    setOpen(false);
    router.push(safeLink(n.link, portal));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [count, list] = await Promise.all([
          apiRequest<{ unread?: number }>("/notifications/unread-count"),
          apiRequest<unknown>("/notifications?page=1&pageSize=5&status=unread"),
        ]);
        if (!active) return;
        setUnread(typeof count.unread === "number" ? count.unread : 0);
        const loaded = (getPageItems(list) as NotificationRow[]).filter((n) => !n.readAt).slice(0, 5);
        setRecent(loaded);
        for (const n of loaded) seenIds.current.add(n.id);
      } catch {
        // Bell is non-critical.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNotif = (payload: unknown) => {
      if (!isInboxNotification(payload)) return;
      const n = payload.notification;
      // Dedupe BEFORE counting; duplicates ignored entirely.
      if (seenIds.current.has(n.id)) return;
      seenIds.current.add(n.id);
      if (isNewUnread(payload, seenIds.current)) {
        setUnread((c) => c + 1);
      }
      setRecent((cur) => (cur.some((x) => x.id === n.id) ? cur : [n, ...cur].slice(0, 5)));
    };
    socket.on(CHAT_SERVER_EVENTS.NOTIFICATION, onNotif as (p: unknown) => void);
    return () => {
      socket.off(CHAT_SERVER_EVENTS.NOTIFICATION, onNotif as (p: unknown) => void);
    };
  }, [socket]);

  return (
    <div className="relative">
      <button type="button" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative grid size-9 place-items-center rounded-full border border-[#d7d9cd] bg-white text-base text-[#526b55] hover:bg-[#f7f3e9]">
        ◉
        {unread > 0 && (
          <span aria-label={`${unread} unread`} className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#293d35] px-1 py-0.5 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-[22px] border border-[#e8e6dc] bg-white p-3 shadow-[0_16px_40px_rgba(41,61,53,0.12)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#788f75]">Recent</p>
            <span className="text-xs text-[#9a9d94]">{unread} unread</span>
          </div>
          <ul className="mt-2 divide-y divide-[#eff2f0]">
            {recent.length === 0 ? (
              <li className="py-3 text-center text-xs text-[#8a9891]">No unread notifications</li>
            ) : (
              recent.slice(0, 3).map((n) => (
                <li key={n.id} className="py-2">
                  <button type="button" onClick={() => void openNotification(n)} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#788f75] rounded" aria-label={`Open ${n.title}`}>
                    <p className="text-sm font-semibold text-[#293d35] hover:underline">{n.title}</p>
                    <p className="truncate text-xs text-[#64776d]">{n.body}</p>
                  </button>
                  <button type="button" onClick={() => {
                    void apiRequest(`/notifications/${n.id}/read`, { method: "PATCH" }).then(() => {
                      setUnread((c) => Math.max(0, c - 1));
                      setRecent((cur) => cur.filter((x) => x.id !== n.id));
                    });
                  }} className="mt-1 text-xs font-bold text-[#526b55] hover:underline">Mark read</button>
                </li>
              ))
            )}
          </ul>
          <Link href={portal === "admin" ? "/admin/notifications" : "/parent/notifications"} onClick={() => setOpen(false)} className="mt-2 block text-center text-xs font-bold text-[#526b55]">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
