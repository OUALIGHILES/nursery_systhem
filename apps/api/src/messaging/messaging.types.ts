import type { RoleName } from '../generated/prisma/enums.js';

export interface ChatUser {
  id: string;
  email: string;
  role: RoleName;
  firstName: string;
  lastName: string;
  parentId: string | null;
  staffId: string | null;
}

export interface ConversationListQuery {
  page: number;
  pageSize: number;
  search?: string;
}

export interface MessageHistoryQuery {
  before?: string;
  pageSize: number;
}

export interface UploadedAttachment {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
