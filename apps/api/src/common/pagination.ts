import { BadRequestException } from "@nestjs/common";

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function normalizePage(params: PageParams): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Math.floor(params.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 0 };
}

export function parseDateParam(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${name}`);
  return d;
}
