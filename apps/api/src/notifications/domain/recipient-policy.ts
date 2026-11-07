import type { PrismaService } from "../../prisma/prisma.service.js";

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "DIRECTOR"] as const;

/**
 * Server-side recipient selection. Never trusts client-supplied IDs —
 * admin recipients are derived from role + active state only.
 */
export async function adminRecipientIds(prisma: PrismaService): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, role: { name: { in: [...ADMIN_ROLES] } } },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

export interface ParentNotifyInput {
  parentUserIds?: string[];
}

/** Parent recipients come only from the event payload parentUserIds
 * (producer-derived from ChildParent links), never from the client. */
export function parentRecipientIds(p: ParentNotifyInput): string[] {
  return p.parentUserIds?.length ? p.parentUserIds : [];
}
