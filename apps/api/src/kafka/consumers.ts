import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BaseEventConsumer, type ConsumedEvent } from "./base-consumer.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MailService } from "../common/mail.service.js";
import { KAFKA } from "./topics.js";
import type { Env } from "../config/env.js";

const ALL_TOPICS = [...KAFKA.TOPICS];

interface ParentNotifyPayload {
  parentUserIds?: string[];
  title?: string;
  body?: string;
  link?: string;
  [k: string]: unknown;
}

async function notifyUsers(prisma: PrismaService, userIds: string[] | undefined, type: "CHECK_IN" | "CHECK_OUT" | "ABSENCE" | "INVOICE" | "PAYMENT" | "INCIDENT" | "ENROLLMENT" | "GENERAL", title: string, body: string, link?: string) {
  if (!userIds?.length) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, title, body, link: link ?? null })),
  });
}

@Injectable()
export class AuditEventConsumer extends BaseEventConsumer {
  protected readonly groupId = KAFKA.GROUPS.AUDIT;
  protected readonly topics = ALL_TOPICS;
  constructor(config: ConfigService<Env, true>, prisma: PrismaService) {
    super(config, prisma);
  }
  protected async handle(event: ConsumedEvent) {
    await this.prisma.auditLog.create({
      data: {
        action: event.topic,
        entity: event.topic.split(".")[0],
        entityId: typeof event.payload.id === "string" ? event.payload.id : null,
        metadata: { eventId: event.eventId, payload: event.payload } as object,
      },
    });
  }
}

@Injectable()
export class NotificationEventConsumer extends BaseEventConsumer {
  protected readonly groupId = KAFKA.GROUPS.NOTIFICATIONS;
  protected readonly topics = [
    "notification.requested",
    "enrollment.approved",
    "enrollment.rejected",
    "incident.reported",
  ];
  constructor(config: ConfigService<Env, true>, prisma: PrismaService) {
    super(config, prisma);
  }
  protected async handle(event: ConsumedEvent) {
    const p = event.payload as ParentNotifyPayload & { userId?: string; type?: never };
    if (event.topic === "notification.requested" && p.userId) {
      await this.prisma.notification.create({
        data: {
          userId: p.userId,
          type: "GENERAL",
          title: String(p.title ?? "Notification"),
          body: String(p.body ?? ""),
          link: (p.link as string | undefined) ?? null,
        },
      });
      return;
    }
    if (event.topic === "enrollment.approved" || event.topic === "enrollment.rejected") {
      const approved = event.topic === "enrollment.approved";
      const email = String(p.parentEmail ?? "");
      const user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
      if (user) {
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: "ENROLLMENT",
            title: approved ? "Enrollment approved" : "Enrollment update",
            body: approved
              ? `Your application ${String(p.reference ?? "")} has been approved.`
              : `Your application ${String(p.reference ?? "")} requires attention.`,
            link: "/parent/applications",
          },
        });
      }
      return;
    }
    if (event.topic === "incident.reported") {
      await notifyUsers(
        this.prisma,
        p.parentUserIds,
        "INCIDENT",
        "Incident report",
        String(p.body ?? p.description ?? "An incident was reported involving your child."),
        "/parent",
      );
    }
  }
}

@Injectable()
export class EmailEventConsumer extends BaseEventConsumer {
  protected readonly groupId = KAFKA.GROUPS.EMAIL;
  protected readonly topics = [
    "notification.requested",
    "enrollment.approved",
    "enrollment.rejected",
  ];
  constructor(config: ConfigService<Env, true>, prisma: PrismaService, private readonly mail: MailService) {
    super(config, prisma);
  }
  protected async handle(event: ConsumedEvent) {
    const p = event.payload as Record<string, unknown>;
    const to = String(p.email ?? p.parentEmail ?? "");
    if (!to) {
      this.logger.warn(`consumer.email.skipped {topic: "${event.topic}", eventId: "${event.eventId}", reason: "missing-recipient"}`);
      return; // nothing to send
    }
    const start = Date.now();
    if (event.topic === "notification.requested") {
      if (!p.email) return;
      const result = await this.mail.send(to, String(p.title ?? "Notification"), String(p.body ?? ""));
      this.logger.log(`consumer.email.sent {topic: "notification.requested", eventId: "${event.eventId}", mode: "${result.mode}", delivered: ${result.delivered}, durationMs: ${Date.now() - start}}`);
      return;
    }
    if (event.topic === "enrollment.approved") {
      const result = await this.mail.send(
        to,
        "Your enrollment application has been approved",
        `Dear ${String(p.parentName ?? "parent")},\n\nWe are delighted to confirm that the application for ${String(p.childName ?? "your child")} (reference ${String(p.reference ?? "")}) has been approved for the ${String(p.program ?? "requested")} program. Our admissions team will contact you shortly with start-date details.\n\nLittle Steps Nursery`,
      );
      this.logger.log(`consumer.email.sent {topic: "enrollment.approved", eventId: "${event.eventId}", mode: "${result.mode}", delivered: ${result.delivered}, durationMs: ${Date.now() - start}}`);
      return;
    }
    if (event.topic === "enrollment.rejected") {
      const result = await this.mail.send(
        to,
        "Update on your enrollment application",
        `Dear ${String(p.parentName ?? "parent")},\n\nThank you for your interest. After review, we are unable to offer a place for ${String(p.childName ?? "your child")} at this time (reference ${String(p.reference ?? "")}). ${p.adminNotes ? `Notes: ${String(p.adminNotes)}` : ""}\n\nLittle Steps Nursery`,
      );
      this.logger.log(`consumer.email.sent {topic: "enrollment.rejected", eventId: "${event.eventId}", mode: "${result.mode}", delivered: ${result.delivered}, durationMs: ${Date.now() - start}}`);
    }
  }
}

@Injectable()
export class AttendanceEventConsumer extends BaseEventConsumer {
  protected readonly groupId = KAFKA.GROUPS.ATTENDANCE;
  protected readonly topics = ["attendance.checked_in", "attendance.checked_out", "attendance.absent"];
  constructor(config: ConfigService<Env, true>, prisma: PrismaService) {
    super(config, prisma);
  }
  protected async handle(event: ConsumedEvent) {
    const p = event.payload as ParentNotifyPayload & { childName?: string; date?: string; time?: string };
    const childName = String(p.childName ?? "Your child");
    if (event.topic === "attendance.checked_in") {
      await notifyUsers(this.prisma, p.parentUserIds, "CHECK_IN", "Checked in", `${childName} checked in at ${String(p.time ?? "")}`, "/parent/attendance");
    } else if (event.topic === "attendance.checked_out") {
      await notifyUsers(this.prisma, p.parentUserIds, "CHECK_OUT", "Checked out", `${childName} checked out at ${String(p.time ?? "")}`, "/parent/attendance");
    } else {
      await notifyUsers(this.prisma, p.parentUserIds, "ABSENCE", "Marked absent", `${childName} was marked absent on ${String(p.date ?? "")}`, "/parent/attendance");
    }
  }
}

@Injectable()
export class FinancialEventConsumer extends BaseEventConsumer {
  protected readonly groupId = KAFKA.GROUPS.FINANCIAL;
  protected readonly topics = ["invoice.created", "payment.received"];
  constructor(config: ConfigService<Env, true>, prisma: PrismaService, private readonly mail: MailService) {
    super(config, prisma);
  }
  protected async handle(event: ConsumedEvent) {
    const p = event.payload as Record<string, unknown> & { parentUserId?: string; parentEmail?: string };
    if (event.topic === "invoice.created") {
      const title = "New invoice";
      const body = `Invoice ${String(p.number ?? "")} for ${String(p.total ?? "")} ${String(p.currency ?? "EUR")} is due on ${String(p.dueDate ?? "")}.`;
      if (p.parentUserId) {
        await this.prisma.notification.create({
          data: { userId: String(p.parentUserId), type: "INVOICE", title, body, link: "/parent/invoices" },
        });
      }
      if (p.parentEmail) {
        const result = await this.mail.send(String(p.parentEmail), title, body);
        this.logger.log(`consumer.email.sent {topic: "invoice.created", eventId: "${event.eventId}", mode: "${result.mode}", delivered: ${result.delivered}}`);
      }
      return;
    }
    // payment.received
    const title = "Payment received";
    const body = `We received your payment of ${String(p.amount ?? "")} ${String(p.currency ?? "EUR")} for invoice ${String(p.invoiceNumber ?? "")}. Thank you!`;
    if (p.parentUserId) {
      await this.prisma.notification.create({
        data: { userId: String(p.parentUserId), type: "PAYMENT", title, body, link: "/parent/invoices" },
      });
    }
    if (p.parentEmail) {
      const result = await this.mail.send(String(p.parentEmail), title, body);
      this.logger.log(`consumer.email.sent {topic: "payment.received", eventId: "${event.eventId}", mode: "${result.mode}", delivered: ${result.delivered}}`);
    }
  }
}
