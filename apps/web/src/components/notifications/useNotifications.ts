"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useSocket } from "../../app/chat/hooks/use-socket";
import { CHAT_SERVER_EVENTS } from "../../app/chat/socket-events";
import { isInboxNotification, isNewUnread, upsertNotification, type NotificationRow } from "./lib";

export type StatusFilter = "all" | "unread" | "read";

export function buildQuery(params: { status: StatusFilter; type: string; q: string; page: number; pageSize: number }): string {
  const p = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), status: params.status });
  if (params.type) p.set("type", params.type);
  if (params.q.trim()) p.set("q", params.q.trim());
  return p.toString();
}

export function useNotifications() {
  const { socket } = useSocket();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery({ status, type, q, page, pageSize });
      const data = (await apiRequest<{ items?: NotificationRow[]; total?: number; totalPages?: number }>(`/notifications?${qs}`)) as {
        items?: NotificationRow[];
        total?: number;
        totalPages?: number;
      };
      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      for (const n of list) seenIds.current.add(n.id);
      setTotal(typeof data.total === "number" ? data.total : list.length);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : 1);
      const c = await apiRequest<{ unread?: number }>("/notifications/unread-count");
      setUnread(typeof c.unread === "number" ? c.unread : 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, q, status, type]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onNotif = (payload: unknown) => {
      if (!isInboxNotification(payload)) return;
      const id = payload.notification.id;
      // Dedupe BEFORE counting; already-read never counts.
      if (seenIds.current.has(id)) return;
      seenIds.current.add(id);
      if (isNewUnread(payload, seenIds.current)) {
        setUnread((c) => c + 1);
      }
      if (status === "all" || status === "unread") {
        setItems((cur) => {
          const next = upsertNotification(cur, payload);
          if (next !== cur) setTotal((t) => t + 1);
          return next.slice(0, pageSize);
        });
      }
    };
    socket.on(CHAT_SERVER_EVENTS.NOTIFICATION, onNotif as (p: unknown) => void);
    return () => {
      socket.off(CHAT_SERVER_EVENTS.NOTIFICATION, onNotif as (p: unknown) => void);
    };
  }, [pageSize, socket, status]);

  async function markRead(id: string) {
    await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((c) => Math.max(0, c - 1));
  }

  async function markAll() {
    await apiRequest("/notifications/read-all", { method: "PATCH" });
    setItems((cur) => cur.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setUnread(0);
  }

  return {
    status, setStatus, type, setType, q, setQ, page, setPage,
    items, total, totalPages, unread, loading, error,
    load, markRead, markAll,
  };
}
