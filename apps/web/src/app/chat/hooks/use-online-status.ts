"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { CHAT_SERVER_EVENTS } from "../socket-events";

export function useOnlineStatus(
  socket: Socket | null,
  peerId: string | undefined,
  initialOnline = false,
) {
  const [presence, setPresence] = useState<{
    peerId: string | undefined;
    online: boolean;
  }>({
    peerId,
    online: initialOnline,
  });
  const online = presence.peerId === peerId ? presence.online : initialOnline;

  useEffect(() => {
    if (!socket || !peerId) return;
    const update = (presence: { userId: string; online: boolean }) => {
      if (presence.userId === peerId)
        setPresence({ peerId, online: presence.online });
    };
    socket.on(CHAT_SERVER_EVENTS.PRESENCE, update);
    return () => {
      socket.off(CHAT_SERVER_EVENTS.PRESENCE, update);
    };
  }, [socket, peerId]);

  return online;
}
