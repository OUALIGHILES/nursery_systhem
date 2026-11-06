import { chatRequest } from "../app/chat/chat-api";

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return chatRequest<T>(path, init);
}

export function getPageItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }
  if (!isRecord(data)) return [];
  if (Array.isArray(data.items)) return data.items.filter(isRecord);
  if (Array.isArray(data.data)) return data.data.filter(isRecord);
  if (Array.isArray(data.byMonth)) return data.byMonth.filter(isRecord);
  return [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
