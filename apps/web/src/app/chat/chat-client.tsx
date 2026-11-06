"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chatRequest } from "./chat-api";
import type { ChatContact, ChatMessage } from "./chat-types";
import { useChat } from "./hooks/use-chat";
import { useConversation } from "./hooks/use-conversation";
import { useOnlineStatus } from "./hooks/use-online-status";
import { useSocket } from "./hooks/use-socket";
import { useTypingIndicator } from "./hooks/use-typing-indicator";

interface Session {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePassword?: boolean;
}

export default function ChatClient() {
  const router = useRouter();
  const { socket, connected, connectionError } = useSocket();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void chatRequest<Session>("/auth/me")
      .then((user) => {
        if (!active) return;
        if (user.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        setSession(user);
      })
      .catch((cause: Error) => {
        if (active) setAuthError(cause.message);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (authLoading) return <CenteredState title="Loading your messages…" />;
  if (!session)
    return (
      <CenteredState
        title="Sign in to use messaging"
        detail={authError ?? "Your session is not available."}
      />
    );

  return (
    <MessagingScreen
      socket={socket}
      connected={connected}
      connectionError={connectionError}
      session={session}
    />
  );
}

function MessagingScreen({
  socket,
  connected,
  connectionError,
  session,
}: {
  socket: ReturnType<typeof useSocket>["socket"];
  connected: boolean;
  connectionError: string | null;
  session: Session;
}) {
  const chat = useChat(socket, session.id);
  const active =
    chat.conversations.find(
      (conversation) => conversation.id === chat.selectedId,
    ) ?? null;
  const conversation = useConversation(socket, chat.selectedId, session.id);
  const online = useOnlineStatus(
    socket,
    active?.peer?.id,
    active?.online ?? false,
  );
  const { typingName, updateTyping } = useTypingIndicator(
    socket,
    chat.selectedId ?? undefined,
    session.id,
  );
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(
    null,
  );
  const [selectedChildId, setSelectedChildId] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNearBottom = useRef(true);

  const peerName = active?.peer
    ? `${active.peer.firstName} ${active.peer.lastName}`
    : "Conversation";
  const peerRole = active?.peer?.role?.replaceAll("_", " ").toLowerCase() ?? "";
  const totalUnread = chat.conversations.reduce(
    (total, item) => total + item.unreadCount,
    0,
  );

  useEffect(() => {
    const list = listRef.current;
    if (list && isNearBottom.current) list.scrollTop = list.scrollHeight;
  }, [conversation.messages]);

  const filterConversations = useMemo(
    () => chat.conversations,
    [chat.conversations],
  );

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!chat.selectedId || (!draft.trim() && files.length === 0)) return;
    setActionError(null);
    try {
      if (files.length > 0) await conversation.sendAttachments(draft, files);
      else await conversation.sendText(draft);
      setDraft("");
      setFiles([]);
      updateTyping(false);
    } catch (cause) {
      setActionError((cause as Error).message);
    }
  }

  function onDraft(value: string) {
    setDraft(value);
    updateTyping(Boolean(value.trim()));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (value.trim())
      typingTimer.current = setTimeout(() => updateTyping(false), 1800);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function startConversation(contact: ChatContact) {
    const childId = selectedChildId || contact.children[0]?.id;
    if (contact.children.length > 0 && !childId) {
      setActionError("Select the child this conversation is about.");
      return;
    }
    try {
      await chat.createConversation(contact.id, childId);
      setContactsOpen(false);
      setSelectedContact(null);
      setSelectedChildId("");
      setMobileChatOpen(true);
    } catch {
      setActionError(chat.error ?? "Could not start conversation.");
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f5f7f6] text-[#21332d]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#e4ebe7] bg-white px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="grid size-10 place-items-center rounded-2xl bg-[#e6f4ed] text-lg font-bold text-[#26714c]"
            aria-label="Home"
          >
            L
          </Link>
          <div>
            <p className="text-sm font-semibold">Little Steps</p>
            <p className="text-xs text-[#77857e]">Messages</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${connected ? "bg-[#e6f4ed] text-[#26714c]" : "bg-amber-50 text-amber-800"}`}
          >
            <span
              className={`size-2 rounded-full ${connected ? "bg-[#42a575]" : "bg-amber-500"}`}
            />
            {connected ? "Live connection" : "Reconnecting"}
          </span>
          <span className="hidden text-sm text-[#66766e] sm:block">
            {session.firstName} {session.lastName}
          </span>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 p-0 sm:p-5 lg:p-7">
        <section className="flex min-h-[calc(100vh-72px)] w-full overflow-hidden bg-white sm:min-h-[calc(100vh-112px)] sm:rounded-2xl sm:border sm:border-[#e3ebe6] sm:shadow-[0_8px_40px_rgba(27,52,40,0.05)]">
          <aside
            className={`${mobileChatOpen ? "hidden sm:flex" : "flex"} w-full shrink-0 flex-col border-r border-[#edf1ee] sm:w-[330px] lg:w-[370px]`}
          >
            <div className="flex items-center justify-between px-5 pb-3 pt-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Messages
                </h1>
                <p className="mt-1 text-xs text-[#87948d]">
                  {totalUnread
                    ? `${totalUnread} unread`
                    : "Keep in touch with your nursery"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setContactsOpen(true);
                  void chat.loadContacts("");
                  setActionError(null);
                }}
                className="rounded-xl bg-[#26714c] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#1c5f3d]"
              >
                New chat
              </button>
            </div>
            <label className="dark-mode-search mx-5 mb-4 flex items-center gap-2 rounded-xl border border-[#e7ece9] bg-[#f9fbfa] px-3 py-2.5">
              <span className="text-[#829189]" aria-hidden="true">
                ⌕
              </span>
              <input
                aria-label="Search conversations"
                value={chat.conversationSearch}
                onChange={(event) =>
                  chat.setConversationSearch(event.target.value)
                }
                placeholder="Search conversations"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa69f]"
              />
            </label>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {chat.loading && (
                <p className="px-3 py-5 text-sm text-[#87948d]">
                  Loading conversations…
                </p>
              )}
              {!chat.loading && filterConversations.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#f1f7f3] text-xl text-[#56906e]">
                    ✉
                  </div>
                  <p className="text-sm font-medium">No conversations yet</p>
                  <p className="mt-1 text-xs leading-5 text-[#87948d]">
                    Start a conversation with your nursery team.
                  </p>
                </div>
              )}
              {filterConversations.map((item) => {
                const name = item.peer
                  ? `${item.peer.firstName} ${item.peer.lastName}`
                  : "Conversation";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      chat.selectConversation(item.id);
                      setMobileChatOpen(true);
                    }}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${chat.selectedId === item.id ? "bg-[#edf6f0]" : "hover:bg-[#f7faf8]"}`}
                  >
                    <Avatar name={name} online={item.online} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {name}
                        </span>
                        <span className="shrink-0 text-[10px] text-[#9aa69f]">
                          {item.lastMessage
                            ? formatTime(item.lastMessage.createdAt)
                            : ""}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-[#829189]">
                          {item.lastMessage?.deletedAt
                            ? "Message deleted"
                            : (item.lastMessage?.content ??
                              item.lastMessage?.attachments[0]?.fileName ??
                              "Start a conversation")}
                        </span>
                        {item.unreadCount > 0 && (
                          <span className="grid min-w-5 place-items-center rounded-full bg-[#26714c] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {item.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            className={`${mobileChatOpen ? "flex" : "hidden sm:flex"} min-w-0 flex-1 flex-col`}
          >
            {!active ? (
              <div className="hidden flex-1 flex-col items-center justify-center px-8 text-center sm:flex">
                <div className="mb-5 grid size-16 place-items-center rounded-[22px] bg-[#eaf4ee] text-2xl text-[#4c8967]">
                  ✦
                </div>
                <h2 className="text-lg font-semibold">
                  A little more connected
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#829189]">
                  Choose a conversation to catch up, or start a new one with
                  your nursery team.
                </p>
              </div>
            ) : (
              <>
                <header className="flex h-[76px] items-center gap-3 border-b border-[#edf1ee] px-4 sm:px-6">
                  <button
                    type="button"
                    className="mr-1 text-lg text-[#718078] sm:hidden"
                    onClick={() => setMobileChatOpen(false)}
                    aria-label="Back to conversations"
                  >
                    ‹
                  </button>
                  <Avatar name={peerName} online={online} large />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold">
                      {peerName}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#829189]">
                      {online ? "Online" : peerRole || "Offline"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f4f7f5] px-3 py-1.5 text-[11px] capitalize text-[#738078]">
                    {active.type.replaceAll("_", " ").toLowerCase()}
                  </span>
                </header>

                <div
                  ref={listRef}
                  onScroll={(event) => {
                    const element = event.currentTarget;
                    isNearBottom.current =
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight <
                      120;
                    if (element.scrollTop < 50 && !conversation.loadingOlder)
                      void conversation.loadOlder();
                  }}
                  className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#fbfcfb] px-4 py-5 sm:px-7"
                >
                  {conversation.loadingOlder && (
                    <p className="py-2 text-center text-xs text-[#87948d]">
                      Loading older messages…
                    </p>
                  )}
                  {conversation.loading && (
                    <p className="py-8 text-center text-sm text-[#87948d]">
                      Loading messages…
                    </p>
                  )}
                  {!conversation.loading &&
                    conversation.messages.length === 0 && (
                      <div className="m-auto max-w-xs py-12 text-center">
                        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[#eff6f1] text-[#57906c]">
                          ✉
                        </div>
                        <p className="text-sm font-medium">Say hello</p>
                        <p className="mt-1 text-xs leading-5 text-[#87948d]">
                          Your conversation is private to its participants.
                        </p>
                      </div>
                    )}
                  {conversation.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      own={message.senderId === session.id}
                      peerId={active.peer?.id}
                      onDelete={() =>
                        void conversation
                          .deleteMessage(message.id)
                          .catch((cause: Error) =>
                            setActionError(cause.message),
                          )
                      }
                      onDownload={(attachmentId, fileName) =>
                        void conversation
                          .downloadAttachment(
                            message.id,
                            attachmentId,
                            fileName,
                          )
                          .catch((cause: Error) =>
                            setActionError(cause.message),
                          )
                      }
                    />
                  ))}
                  {typingName && (
                    <p className="px-2 text-xs italic text-[#809087]">
                      {typingName} is typing…
                    </p>
                  )}
                </div>

                {(conversation.error ||
                  actionError ||
                  chat.error ||
                  connectionError) && (
                  <div
                    role="alert"
                    className="mx-4 mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"
                  >
                    {actionError ??
                      conversation.error ??
                      chat.error ??
                      connectionError}
                  </div>
                )}
                <form
                  onSubmit={(event) => void send(event)}
                  className="border-t border-[#edf1ee] bg-white px-3 py-3 sm:px-5 sm:py-4"
                >
                  {files.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 rounded-lg bg-[#f1f6f2] px-2.5 py-1.5 text-xs text-[#52655a]"
                        >
                          {file.name}
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((current) =>
                                current.filter((_, i) => i !== index),
                              )
                            }
                            aria-label={`Remove ${file.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2 rounded-2xl border border-[#e6ece8] bg-[#fbfcfb] p-2 focus-within:border-[#9ec2aa]">
                    <label
                      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-lg text-[#74847b] hover:bg-[#edf5ef]"
                      title="Attach file"
                    >
                      +
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(event) => {
                          const selected = Array.from(event.target.files ?? []);
                          setFiles((current) =>
                            [...current, ...selected].slice(0, 5),
                          );
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <textarea
                      value={draft}
                      onChange={(event) => onDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      onBlur={() => updateTyping(false)}
                      rows={1}
                      maxLength={5000}
                      placeholder="Write a message…"
                      className="max-h-28 min-h-9 flex-1 resize-y bg-transparent px-1 py-2 text-sm outline-none placeholder:text-[#9aa69f]"
                    />
                    <button
                      type="submit"
                      disabled={
                        !connected || (!draft.trim() && files.length === 0)
                      }
                      className="h-9 shrink-0 rounded-xl bg-[#26714c] px-4 text-sm font-medium text-white transition hover:bg-[#1c5f3d] disabled:cursor-not-allowed disabled:bg-[#b9c9bf]"
                    >
                      Send
                    </button>
                  </div>
                  <p className="mt-2 px-1 text-[10px] text-[#a0aaa4]">
                    Enter to send · Shift + Enter for a new line
                  </p>
                </form>
              </>
            )}
          </section>
        </section>
      </div>

      {contactsOpen && (
        <ContactDialog
          contacts={chat.contacts}
          search={chat.contactSearch}
          selected={selectedContact}
          selectedChildId={selectedChildId}
          busy={chat.loading}
          error={actionError ?? chat.error}
          onSearch={(search) => void chat.loadContacts(search)}
          onSelect={(contact) => {
            setSelectedContact(contact);
            setSelectedChildId(contact.children[0]?.id ?? "");
            setActionError(null);
          }}
          onChild={setSelectedChildId}
          onStart={() =>
            selectedContact && void startConversation(selectedContact)
          }
          onClose={() => {
            setContactsOpen(false);
            setSelectedContact(null);
            setActionError(null);
          }}
        />
      )}
    </main>
  );
}

function ContactDialog({
  contacts,
  search,
  selected,
  selectedChildId,
  busy,
  error,
  onSearch,
  onSelect,
  onChild,
  onStart,
  onClose,
}: {
  contacts: ChatContact[];
  search: string;
  selected: ChatContact | null;
  selectedChildId: string;
  busy: boolean;
  error: string | null;
  onSearch: (search: string) => void;
  onSelect: (contact: ChatContact) => void;
  onChild: (id: string) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-[#16261e]/35 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="new-chat-title" className="text-lg font-semibold">
              Start a conversation
            </h2>
            <p className="mt-1 text-xs text-[#829189]">
              Choose an authorized nursery contact.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-xl text-[#829189] hover:bg-[#f3f6f4]"
          >
            ×
          </button>
        </div>
        <input
          autoFocus
          aria-label="Search contacts by name or email"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search by name or email"
          className="dark-mode-search-input mt-5 w-full rounded-xl border border-[#e5ebe7] bg-[#fbfcfb] px-3 py-2.5 text-sm outline-none focus:border-[#9ec2aa]"
        />
        <div className="mt-3 max-h-64 overflow-y-auto">
          {busy && (
            <p className="px-2 py-4 text-sm text-[#829189]">Searching…</p>
          )}
          {!busy && contacts.length === 0 && (
            <p className="px-2 py-4 text-sm text-[#829189]">
              No eligible contacts found.
            </p>
          )}
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelect(contact)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left ${selected?.id === contact.id ? "bg-[#edf6f0]" : "hover:bg-[#f7faf8]"}`}
            >
              <Avatar name={`${contact.firstName} ${contact.lastName}`} />
              <span>
                <span className="block text-sm font-medium">
                  {contact.firstName} {contact.lastName}
                </span>
                <span className="text-xs capitalize text-[#87948d]">
                  {contact.role.replaceAll("_", " ").toLowerCase()}
                </span>
              </span>
            </button>
          ))}
        </div>
        {selected?.children.length ? (
          <label className="mt-4 block text-xs font-medium text-[#68786e]">
            About which child?
            <select
              value={selectedChildId}
              onChange={(event) => onChild(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#e5ebe7] bg-white px-3 py-2.5 text-sm"
            >
              {selected.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-[#6d7c73] hover:bg-[#f4f7f5]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={onStart}
            className="rounded-xl bg-[#26714c] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Start chat
          </button>
        </div>
      </section>
    </div>
  );
}

function MessageBubble({
  message,
  own,
  peerId,
  onDelete,
  onDownload,
}: {
  message: ChatMessage;
  own: boolean;
  peerId?: string;
  onDelete: () => void;
  onDownload: (attachmentId: string, fileName: string) => void;
}) {
  const read =
    own && peerId
      ? message.receipts.some(
          (receipt) => receipt.userId === peerId && receipt.readAt,
        )
      : false;
  const delivered =
    own && peerId
      ? message.receipts.some(
          (receipt) => receipt.userId === peerId && receipt.deliveredAt,
        )
      : false;
  return (
    <div
      className={`group flex max-w-[88%] flex-col ${own ? "ml-auto items-end" : "mr-auto items-start"} sm:max-w-[75%]`}
    >
      {!own && (
        <span className="mb-1 px-2 text-[10px] font-medium text-[#8a9890]">
          {message.sender.firstName}
        </span>
      )}
      <div
        className={`rounded-2xl px-3.5 py-2.5 ${own ? "rounded-br-md bg-[#e6f3eb] text-[#294a36]" : "rounded-bl-md border border-[#e9eeeb] bg-white text-[#34443b]"}`}
      >
        {message.deletedAt ? (
          <p className="text-sm italic text-[#8a9890]">
            This message was deleted.
          </p>
        ) : (
          <>
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.content}
              </p>
            )}
            {message.attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => onDownload(attachment.id, attachment.fileName)}
                className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-black/5 bg-white/70 px-2.5 py-2 text-left text-xs hover:bg-white"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#edf4ef] text-[#568267]">
                  {attachment.mimeType.startsWith("image/") ? "▧" : "↧"}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[220px] truncate font-medium">
                    {attachment.fileName}
                  </span>
                  <span className="text-[10px] text-[#8a9890]">
                    {formatBytes(attachment.fileSize)}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 px-2 text-[10px] text-[#9aa69f]">
        <time dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
        {own && <span>{read ? "Read" : delivered ? "Delivered" : "Sent"}</span>}
        {own && !message.deletedAt && (
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 transition group-hover:opacity-100 hover:text-rose-700"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Avatar({
  name,
  online = false,
  large = false,
}: {
  name: string;
  online?: boolean;
  large?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-2xl bg-[#edf4ef] font-semibold text-[#4d8060] ${large ? "size-11 text-sm" : "size-10 text-xs"}`}
    >
      {initials}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-[#4eaa75]" />
      )}
    </span>
  );
}

function CenteredState({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7f6] px-6 text-center">
      <div>
        <p className="text-lg font-semibold text-[#21332d]">{title}</p>
        {detail && <p className="mt-2 text-sm text-[#78877f]">{detail}</p>}
        <a
          href="/login"
          className="mt-5 inline-block rounded-xl bg-[#26714c] px-4 py-2 text-sm font-medium text-white"
        >
          Go to sign in
        </a>
      </div>
    </main>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
