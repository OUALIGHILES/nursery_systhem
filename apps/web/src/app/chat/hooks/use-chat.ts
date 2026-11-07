"use client";

import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { chatRequest } from "../chat-api";
import type { ChatContact, ChatConversation, ChatMessage, ChatPeer } from "../chat-types";
import { CHAT_SERVER_EVENTS } from "../socket-events";

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function normalizeRole(role: unknown): string {
  if (typeof role === "string") return role;
  if (role && typeof role === "object" && "name" in role && typeof (role as { name: unknown }).name === "string")
    return (role as { name: string }).name;
  return "";
}

function normalizePeer<T extends { role: unknown }>(peer: T | null | undefined): T | null {
  if (!peer) return null;
  return { ...peer, role: normalizeRole(peer.role) as T["role"] };
}

function normalizeConversation<T extends ChatConversation>(conv: T): T {
  const peer = normalizePeer(conv.peer);
  const lastSender = (conv.lastMessage as { sender?: ChatPeer | null } | null)?.sender;
  const lastMessage = conv.lastMessage && lastSender
    ? { ...conv.lastMessage, sender: normalizePeer(lastSender) as ChatPeer }
    : conv.lastMessage;
  return { ...conv, peer: peer as ChatConversation["peer"], lastMessage };
}

function normalizeMessage<T extends ChatMessage>(msg: T): T {
  if (!msg?.sender) return msg;
  return { ...msg, sender: normalizePeer(msg.sender) as ChatPeer };
}

export function useChat(socket: Socket | null, currentUserId: string) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await chatRequest<Page<ChatConversation>>(
        `/messaging/conversations?page=1&pageSize=50&search=${encodeURIComponent(conversationSearch)}`,
      );
      setConversations((page.items ?? []).map(normalizeConversation));
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [conversationSearch]);

  useEffect(() => {
    let active = true;
    void chatRequest<Page<ChatConversation>>(
      `/messaging/conversations?page=1&pageSize=50&search=${encodeURIComponent(conversationSearch)}`,
    )
      .then((page) => {
        if (!active) return;
        setConversations((page.items ?? []).map(normalizeConversation));
        setError(null);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [conversationSearch]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (message: ChatMessage) => {
      const normalized = normalizeMessage(message);
      setConversations((current) =>
        current
          .map((conversation) => {
            if (conversation.id !== normalized.conversationId) return conversation;
            const isIncoming = normalized.senderId !== currentUserId;
            return {
              ...conversation,
              lastMessage: normalized,
              updatedAt: normalized.createdAt,
              unreadCount:
                isIncoming && selectedId !== conversation.id
                  ? conversation.unreadCount + 1
                  : conversation.unreadCount,
            };
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    };
    const onNotification = () => {
      void reload();
    };
    const onRead = (event: { conversationId: string; userId: string }) => {
      if (event.userId === currentUserId) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === event.conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      }
    };
    socket.on(CHAT_SERVER_EVENTS.MESSAGE, onMessage);
    socket.on(CHAT_SERVER_EVENTS.NOTIFICATION, onNotification);
    socket.on(CHAT_SERVER_EVENTS.READ, onRead);
    return () => {
      socket.off(CHAT_SERVER_EVENTS.MESSAGE, onMessage);
      socket.off(CHAT_SERVER_EVENTS.NOTIFICATION, onNotification);
      socket.off(CHAT_SERVER_EVENTS.READ, onRead);
    };
  }, [socket, currentUserId, reload, selectedId]);

  const loadContacts = useCallback(async (search: string) => {
    setContactSearch(search);
    try {
      const result = await chatRequest<ChatContact[]>(
        `/messaging/contacts?search=${encodeURIComponent(search)}`,
      );
      setContacts((result ?? []).map((c) => ({ ...c, role: normalizeRole(c.role) as ChatContact["role"] })));
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  const createConversation = useCallback(
    async (participantId: string, childId?: string) => {
      try {
        const conversation = await chatRequest<ChatConversation>(
          "/messaging/conversations",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              participantId,
              ...(childId ? { childId } : {}),
            }),
          },
        );
        await reload();
        setSelectedId(conversation.id);
        return conversation.id;
      } catch (cause) {
        const message = (cause as Error).message;
        setError(message);
        throw cause;
      }
    },
    [reload],
  );

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId(conversationId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    );
  }, []);

  return {
    conversations,
    contacts,
    selectedId,
    loading,
    error,
    contactSearch,
    conversationSearch,
    setConversationSearch,
    setError,
    reload,
    loadContacts,
    createConversation,
    selectConversation,
  };
}
