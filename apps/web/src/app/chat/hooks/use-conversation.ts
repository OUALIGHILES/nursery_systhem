"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { chatRequest, API_BASE, refreshChatSession } from "../chat-api";
import type { ChatMessage } from "../chat-types";
import { CHAT_CLIENT_EVENTS, CHAT_SERVER_EVENTS } from "../socket-events";

function normalizeMessage<T extends ChatMessage>(msg: T): T {
  const sender = (msg as { sender?: { role?: unknown } | null })?.sender;
  if (!sender?.role || typeof sender.role === "string") return msg;
  const name = (sender.role as { name?: unknown }).name;
  if (typeof name !== "string") return msg;
  return { ...msg, sender: { ...sender, role: name } as T["sender"] };
}

export function useConversation(
  socket: Socket | null,
  conversationId: string | null,
  currentUserId: string,
) {
  const [storedMessages, setStoredMessages] = useState<{
    conversationId: string | null;
    items: ChatMessage[];
  }>({
    conversationId,
    items: [],
  });
  const messages = useMemo(
    () =>
      storedMessages.conversationId === conversationId
        ? storedMessages.items
        : [],
    [storedMessages, conversationId],
  );
  const [loadState, setLoadState] = useState<{
    conversationId: string | null;
    loading: boolean;
  }>({
    conversationId,
    loading: Boolean(conversationId),
  });
  const loading =
    conversationId === null
      ? false
      : loadState.conversationId !== conversationId
        ? true
        : loadState.loading;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [errorState, setErrorState] = useState<{
    conversationId: string | null;
    message: string | null;
  }>({
    conversationId,
    message: null,
  });
  const error =
    errorState.conversationId === conversationId ? errorState.message : null;

  const updateMessages = useCallback(
    (update: (current: ChatMessage[]) => ChatMessage[]) => {
      setStoredMessages((stored) => {
        const current =
          stored.conversationId === conversationId ? stored.items : [];
        return { conversationId, items: update(current) };
      });
    },
    [conversationId],
  );

  const addMessage = useCallback(
    (message: ChatMessage) => {
      updateMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current.map((item) => (item.id === message.id ? message : item))
          : [...current, message].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            ),
      );
    },
    [updateMessages],
  );

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    void chatRequest<ChatMessage[]>(
      `/messaging/conversations/${conversationId}/messages`,
    )
      .then((history) => {
        if (!active) return;
        const normalized = (history ?? []).map(normalizeMessage);
        setStoredMessages({ conversationId, items: normalized });
        setErrorState({ conversationId, message: null });
        for (const message of normalized) {
          if (
            message.senderId !== currentUserId &&
            !message.receipts.some(
              (receipt) =>
                receipt.userId === currentUserId && receipt.deliveredAt,
            )
          ) {
            socket?.emit(CHAT_CLIENT_EVENTS.DELIVERED, {
              messageId: message.id,
            });
          }
        }
        socket?.emit(CHAT_CLIENT_EVENTS.READ, { conversationId });
      })
      .catch((cause: Error) => {
        if (active) setErrorState({ conversationId, message: cause.message });
      })
      .finally(() => {
        if (active) setLoadState({ conversationId, loading: false });
      });
    return () => {
      active = false;
    };
  }, [conversationId, currentUserId, socket]);

  useEffect(() => {
    if (!socket || !conversationId) return;
    const join = () => {
      socket.emit(CHAT_CLIENT_EVENTS.JOIN, { conversationId });
      socket.emit(CHAT_CLIENT_EVENTS.READ, { conversationId });
    };
    if (socket.connected) join();
    socket.on("connect", join);
    const onMessage = (message: ChatMessage) => {
      const normalized = normalizeMessage(message);
      if (normalized.conversationId !== conversationId) return;
      addMessage(normalized);
      if (normalized.senderId !== currentUserId) {
        socket.emit(CHAT_CLIENT_EVENTS.DELIVERED, { messageId: normalized.id });
        socket.emit(CHAT_CLIENT_EVENTS.READ, { conversationId });
      }
    };
    const onDelivered = (event: {
      messageId: string;
      deliveredAt: string | null;
      senderId: string;
    }) => {
      updateMessages((current) =>
        current.map((message) =>
          message.id !== event.messageId
            ? message
            : {
                ...message,
                receipts: message.receipts.map((receipt) =>
                  receipt.userId === currentUserId
                    ? {
                        ...receipt,
                        deliveredAt: event.deliveredAt ?? receipt.deliveredAt,
                      }
                    : receipt,
                ),
              },
        ),
      );
    };
    const onRead = (event: {
      conversationId: string;
      userId: string;
      readAt: string;
    }) => {
      if (event.conversationId !== conversationId) return;
      updateMessages((current) =>
        current.map((message) => ({
          ...message,
          receipts: message.receipts.map((receipt) =>
            receipt.userId === event.userId
              ? { ...receipt, readAt: event.readAt }
              : receipt,
          ),
        })),
      );
    };
    const onDeleted = (event: {
      conversationId: string;
      messageId: string;
    }) => {
      if (event.conversationId !== conversationId) return;
      updateMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                content: null,
                deletedAt: new Date().toISOString(),
                attachments: [],
              }
            : message,
        ),
      );
    };
    socket.on(CHAT_SERVER_EVENTS.MESSAGE, onMessage);
    socket.on(CHAT_SERVER_EVENTS.DELIVERED, onDelivered);
    socket.on(CHAT_SERVER_EVENTS.READ, onRead);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.off("connect", join);
      socket.off(CHAT_SERVER_EVENTS.MESSAGE, onMessage);
      socket.off(CHAT_SERVER_EVENTS.DELIVERED, onDelivered);
      socket.off(CHAT_SERVER_EVENTS.READ, onRead);
      socket.off("message:deleted", onDeleted);
    };
  }, [socket, conversationId, currentUserId, addMessage, updateMessages]);

  const sendText = useCallback(
    async (content: string) => {
      if (!socket?.connected || !conversationId)
        throw new Error(
          "Chat connection is unavailable. Reconnect before sending.",
        );
      setErrorState({ conversationId, message: null });
      const result = await new Promise<ChatMessage>((resolve, reject) => {
        socket
          .timeout(10_000)
          .emit(
            CHAT_CLIENT_EVENTS.SEND,
            { conversationId, content },
            (
              timeoutError: Error | null,
              response: ChatMessage | { message?: string },
            ) => {
              if (timeoutError)
                return reject(
                  new Error("Message delivery timed out. Please try again."),
                );
              if ("message" in response && response.message)
                return reject(new Error(response.message));
              resolve(response as ChatMessage);
            },
          );
      });
      addMessage(normalizeMessage(result));
    },
    [socket, conversationId, addMessage],
  );

  const sendAttachments = useCallback(
    async (content: string, files: File[]) => {
      if (!conversationId) throw new Error("Choose a conversation first.");
      const body = new FormData();
      if (content.trim()) body.append("content", content.trim());
      files.forEach((file) => body.append("attachments", file));
      const message = await chatRequest<ChatMessage>(
        `/messaging/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body,
        },
      );
      addMessage(normalizeMessage(message));
    },
    [conversationId, addMessage],
  );

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const before = encodeURIComponent(messages[0].createdAt);
      const older = await chatRequest<ChatMessage[]>(
        `/messaging/conversations/${conversationId}/messages?before=${before}`,
      );
      updateMessages((current) => [...(older ?? []).map(normalizeMessage), ...current]);
    } catch (cause) {
      setErrorState({ conversationId, message: (cause as Error).message });
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, messages, updateMessages]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      await chatRequest(
        `/messaging/conversations/${conversationId}/messages/${messageId}`,
        { method: "DELETE" },
      );
      updateMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: null,
                deletedAt: new Date().toISOString(),
                attachments: [],
              }
            : message,
        ),
      );
    },
    [conversationId, updateMessages],
  );

  const downloadAttachment = useCallback(
    async (messageId: string, attachmentId: string, fileName: string) => {
      if (!conversationId) return;
      let response = await fetch(
        `${API_BASE}/messaging/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`,
        {
          credentials: "include",
        },
      );
      if (response.status === 401 && (await refreshChatSession())) {
        response = await fetch(
          `${API_BASE}/messaging/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`,
          { credentials: "include" },
        );
      }
      if (!response.ok)
        throw new Error(`Could not download file (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
    [conversationId],
  );

  return {
    messages,
    loading,
    loadingOlder,
    error,
    sendText,
    sendAttachments,
    loadOlder,
    deleteMessage,
    downloadAttachment,
  };
}
