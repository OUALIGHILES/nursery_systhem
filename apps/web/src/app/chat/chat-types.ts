export type ChatRole = string | { name: string };

export interface ChatPeer {
  id: string;
  firstName: string;
  lastName: string;
  role: ChatRole;
}

export function roleLabel(role: ChatRole | string | null | undefined): string {
  const raw = typeof role === "string" ? role : (role?.name ?? "");
  return raw.replaceAll("_", " ").toLowerCase();
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface ChatReceipt {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: string;
  deletedAt: string | null;
  sender: ChatPeer;
  attachments: ChatAttachment[];
  receipts: ChatReceipt[];
}

export interface ChatConversation {
  id: string;
  type: string;
  childId: string | null;
  peer: ChatPeer | null;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  online: boolean;
  updatedAt: string;
}

export interface ChatContact extends ChatPeer {
  children: { id: string; name: string }[];
}
