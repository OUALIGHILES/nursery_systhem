import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          metadata: (params.metadata ?? undefined) as object | undefined,
          ipAddress: params.ipAddress ?? null,
        },
      });
    } catch (err) {
      // Audit must never break the business flow
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }
}
