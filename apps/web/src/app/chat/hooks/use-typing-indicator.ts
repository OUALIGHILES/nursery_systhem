"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { CHAT_CLIENT_EVENTS, CHAT_SERVER_EVENTS } from "../socket-events";

export function useTypingIndicator(
  socket: Socket | null,
  conversationId: string | undefined,
  currentUserId: string,
) {
  const [typing, setTyping] = useState<{
    conversationId: string | undefined;
    name: string | null;
  }>({
    conversationId,
    name: null,
  });
  const typingName =
    typing.conversationId === conversationId ? typing.name : null;
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  useEffect(() => {
    if (!socket || !conversationId) return;
    const update = (event: {
      conversationId: string;
      userId: string;
      firstName: string;
      typing: boolean;
    }) => {
      if (
        event.conversationId !== conversationId ||
        event.userId === currentUserId
      )
        return;
      if (timeout.current) clearTimeout(timeout.current);
      setTyping({
        conversationId,
        name: event.typing ? event.firstName : null,
      });
      if (event.typing)
        timeout.current = setTimeout(
          () => setTyping({ conversationId, name: null }),
          8500,
        );
    };
    socket.on(CHAT_SERVER_EVENTS.TYPING, update);
    return () => {
      socket.off(CHAT_SERVER_EVENTS.TYPING, update);
      if (timeout.current) clearTimeout(timeout.current);
      isTyping.current = false;
    };
  }, [socket, conversationId, currentUserId]);

  const updateTyping = useCallback(
    (typing: boolean) => {
      if (!socket || !conversationId || isTyping.current === typing) return;
      isTyping.current = typing;
      socket.emit(
        typing
          ? CHAT_CLIENT_EVENTS.TYPING_START
          : CHAT_CLIENT_EVENTS.TYPING_STOP,
        { conversationId },
      );
    },
    [socket, conversationId],
  );

  return { typingName, updateTyping };
}
