"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { refreshChatSession } from "../chat-api";

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");
const socketOrigin = apiBase.replace(/\/api\/v\d+$/, "");

export function useSocket() {
  const socket = useMemo(
    () =>
      io(`${socketOrigin}/messaging`, {
        autoConnect: false,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 10_000,
        timeout: 10_000,
      }),
    [],
  );
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setConnectionError(null);
    };
    const onDisconnect = () => setConnected(false);
    const onError = (error: Error) => {
      setConnected(false);
      setConnectionError(error.message || "Unable to connect to messaging");
      if (
        error.message === "Unauthorized" ||
        error.message === "Authentication required"
      ) {
        socket.disconnect();
        void refreshChatSession().then((refreshed) => {
          if (refreshed) {
            setConnectionError(null);
            socket.connect();
          }
        });
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.disconnect();
    };
  }, [socket]);

  return { socket, connected, connectionError };
}
