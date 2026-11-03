import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { OutboxService } from "../kafka/outbox.service";
import { ConfigService } from "@nestjs/config";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { isStaffRole } from "../common/guards/roles.guard";
import { normalizePage, toPage } from "../common/pagination";
import { MockPaymentProvider, StripePaymentProvider, type PaymentProvider } from "./payment-provider";
import type { Env } from "../config/env";
import type { InvoiceStatus, PaymentMethod } from "../generated/prisma/enums";

const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];
const PAYMENT_METHODS: PaymentMethod[] = ["CARD", "BANK_TRANSFER", "CASH", "ONLINE"];

export class CreatePlanDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyAmount!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsIn(["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"])
  program?: "INFANTS" | "TODDLERS" | "PRESCHOOL" | "EARLY_LEARNING";

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  siblingDiscount?: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  parentId!: string;

  @IsOptional()
  @IsUUID()
  tuitionPlanId?: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class QueryInvoicesDto {
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  /** Stripe paymentMethod id when PAYMENT_PROVIDER=stripe */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethodId?: string;
}

@Injectable()
class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService<Env, true>,
    private readonly mock: MockPaymentProvider,
    private readonly stripe: StripePaymentProvider,
  ) {}

  private provider(): PaymentProvider {
    return this.config.get("PAYMENT_PROVIDER", { infer: true }) === "stripe" ? this.stripe : this.mock;
  }

  // ---------- Tuition plans ----------
  listPlans() {
    return this.prisma.tuitionPlan.findMany({ where: { isActive: true }, orderBy: { monthlyAmount: "asc" } });
  }

  async createPlan(dto: CreatePlanDto, actor: AuthenticatedUser) {
    const plan = await this.prisma.tuitionPlan.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        monthlyAmount: dto.monthlyAmount,
        currency: dto.currency ?? "EUR",
        program: dto.program ?? null,
        siblingDiscount: dto.siblingDiscount ?? 0,
      },
    });
    await this.audit.log({ actorId: actor.id, action: "billing.plan_created", entity: "TuitionPlan", entityId: plan.id });
    return plan;
  }

  async updatePlan(id: string, dto: Partial<CreatePlanDto>, actor: AuthenticatedUser) {
    const existing = await this.prisma.tuitionPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tuition plan not found");
    const plan = await this.prisma.tuitionPlan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        monthlyAmount: dto.monthlyAmount,
        currency: dto.currency,
        siblingDiscount: dto.siblingDiscount,
      },
    });
    await this.audit.log({ actorId: actor.id, action: "billing.plan_updated", entity: "TuitionPlan", entityId: id });
    return plan;
  }

  // ---------- Invoices ----------
  async createInvoice(dto: CreateInvoiceDto, actor: AuthenticatedUser) {
    const parent = await this.prisma.parent.findUnique({ where: { id: dto.parentId }, include: { user: true } });
    if (!parent) throw new NotFoundException("Parent not found");
    const plan = dto.tuitionPlanId ? await this.prisma.tuitionPlan.findUnique({ where: { id: dto.tuitionPlanId } }) : null;
    if (dto.tuitionPlanId && !plan) throw new NotFoundException("Tuition plan not found");

    const base = plan ? Number(plan.monthlyAmount) : 0;
    const siblingDiscountPct = plan ? Number(plan.siblingDiscount) : 0;
    const siblingDiscount = (base * siblingDiscountPct) / 100;
    const discount = (dto.discount ?? 0) + siblingDiscount;
    const total = Math.max(0, base - discount);
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) throw new ForbiddenException("periodEnd must be after periodStart");

    const invoice = await this.prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count();
      const number = `INV-${periodStart.getFullYear()}-${String(count + 1).padStart(5, "0")}`;
      const created = await tx.invoice.create({
        data: {
          number,
          parentId: dto.parentId,
          tuitionPlanId: plan?.id ?? null,
          periodStart,
          periodEnd,
          amount: base,
          discount,
          total,
          currency: plan?.currency ?? "EUR",
          dueDate: dto.dueDate ? new Date(dto.dueDate) : periodEnd,
          status: "SENT",
          issuedAt: new Date(),
          notes: dto.notes ?? null,
        },
      });
      await this.outbox.enqueue(
        "invoice.created",
        { id: created.id, number: created.number, parentId: parent.id, parentUserId: parent.userId, parentEmail: parent.user.email, total: total.toFixed(2), currency: created.currency, dueDate: created.dueDate.toISOString().slice(0, 10) },
        tx,
      );
      return created;
    });
    await this.audit.log({ actorId: actor.id, action: "billing.invoice_created", entity: "Invoice", entityId: invoice.id });
    return invoice;
  }

  async listInvoices(query: QueryInvoicesDto, user: AuthenticatedUser) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const scope = isStaffRole(user.role) ? {} : { parent: { userId: user.id } };
    const where = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(query.parentId && isStaffRole(user.role) ? { parentId: query.parentId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { parent: { include: { user: { select: { firstName: true, lastName: true, email: true } } } }, tuitionPlan: { select: { name: true } }, payments: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return toPage(items.map((i) => this.serializeInvoice(i)), total, page, pageSize);
  }

  async getInvoice(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { parent: { include: { user: true } }, tuitionPlan: true, payments: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    this.assertInvoiceAccess(invoice.parent.userId, user);
    return this.serializeInvoice(invoice);
  }

  async recordPayment(id: string, dto: RecordPaymentDto, actor: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { parent: { include: { user: true } }, payments: true } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    this.assertInvoiceAccess(invoice.parent.userId, actor);
    if (invoice.status === "CANCELLED" || invoice.status === "PAID") throw new ForbiddenException(`Invoice is ${invoice.status.toLowerCase()}`);

    const paidSoFar = invoice.payments.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Number(invoice.total) - paidSoFar;

    // Parents pay through the provider; staff can also record manual payments
    const provider = this.provider();
    let providerRef: string | null = null;
    let paymentStatus: "COMPLETED" | "PENDING" | "FAILED" = "COMPLETED";
    if (dto.method === "ONLINE" || dto.method === "CARD") {
      const result = await provider.charge({
        invoiceNumber: invoice.number,
        amount: dto.amount,
        currency: invoice.currency,
        description: `Invoice ${invoice.number}`,
        paymentMethodId: dto.paymentMethodId,
      });
      providerRef = result.providerRef;
      paymentStatus = result.status;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { invoiceId: id, amount: dto.amount, method: dto.method, provider: provider.name, providerRef, status: paymentStatus === "FAILED" ? "FAILED" : "COMPLETED" },
      });
      const newPaid = paidSoFar + (paymentStatus === "FAILED" ? 0 : dto.amount);
      const status: InvoiceStatus = paymentStatus === "FAILED" ? invoice.status : newPaid >= Number(invoice.total) ? "PAID" : invoice.status;
      const inv = await tx.invoice.update({ where: { id }, data: { status } });
      await this.outbox.enqueue(
        "payment.received",
        { id: payment.id, invoiceId: id, invoiceNumber: invoice.number, parentUserId: invoice.parent.userId, parentEmail: invoice.parent.user.email, amount: dto.amount.toFixed(2), currency: invoice.currency },
        tx,
      );
      return inv;
    });
    await this.audit.log({ actorId: actor.id, action: "billing.payment_recorded", entity: "Payment", entityId: id, metadata: { amount: dto.amount, method: dto.method } });
    return { invoiceStatus: updated.status, remaining: Math.max(0, remaining - dto.amount) };
  }

  async revenueReport(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 365 * 86400_000);
    const end = to ? new Date(to) : new Date();
    const payments = await this.prisma.payment.findMany({ where: { status: "COMPLETED", paidAt: { gte: start, lte: end } }, select: { amount: true, paidAt: true } });
    const byMonth = new Map<string, number>();
    for (const p of payments) {
      const key = p.paidAt.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount));
    }
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      totalRevenue: payments.reduce((s, p) => s + Number(p.amount), 0),
      byMonth: [...byMonth.entries()].sort().map(([month, amount]) => ({ month, amount })),
    };
  }

  async invoicePdf(id: string, user: AuthenticatedUser, res: Response) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { parent: { include: { user: true } }, tuitionPlan: true, payments: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    this.assertInvoiceAccess(invoice.parent.userId, user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.number}.pdf"`);
    const doc = new PDFDocument({ margin: 56 });
    doc.pipe(res);
    doc.fontSize(20).text("Little Steps Nursery", { underline: true });
    doc.fontSize(10).text("123 Meadow Lane · Springfield · hello@littlesteps.example");
    doc.moveDown();
    doc.fontSize(16).text(`INVOICE ${invoice.number}`);
    doc.fontSize(10).text(`Issued: ${(invoice.issuedAt ?? invoice.createdAt).toISOString().slice(0, 10)}   Due: ${invoice.dueDate.toISOString().slice(0, 10)}   Status: ${invoice.status}`);
    doc.moveDown();
    doc.fontSize(12).text("Bill to:");
    doc.fontSize(10).text(`${invoice.parent.user.firstName} ${invoice.parent.user.lastName}`);
    doc.text(invoice.parent.address ?? "");
    doc.moveDown();
    doc.text(`Billing period: ${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd.toISOString().slice(0, 10)}`);
    doc.text(`Plan: ${invoice.tuitionPlan?.name ?? "Nursery fees"}`);
    doc.moveDown();
    doc.text(`Tuition:        ${Number(invoice.amount).toFixed(2)} ${invoice.currency}`);
    doc.text(`Discount:     -${Number(invoice.discount).toFixed(2)} ${invoice.currency}`);
    doc.fontSize(12).text(`Total due:      ${Number(invoice.total).toFixed(2)} ${invoice.currency}`);
    doc.moveDown();
    doc.fontSize(9).text("Thank you for trusting us with your child's care. Payment by bank transfer or through the parent portal.", { align: "center" });
    doc.end();
  }

  private assertInvoiceAccess(parentUserId: string, user: AuthenticatedUser) {
    if (isStaffRole(user.role)) return;
    if (user.id !== parentUserId) throw new ForbiddenException("You do not have access to this invoice");
  }

  private serializeInvoice(i: {
    id: string; number: string; periodStart: Date; periodEnd: Date; amount: unknown; discount: unknown; total: unknown;
    currency: string; dueDate: Date; status: InvoiceStatus; issuedAt: Date | null; notes: string | null; createdAt: Date;
    parent: { id: string; address: string | null; user: { firstName: string; lastName: string; email: string } };
    tuitionPlan: { name: string } | null;
    payments: { id: string; amount: unknown; method: string; status: string; paidAt: Date }[];
  }) {
    return {
      id: i.id,
      number: i.number,
      periodStart: i.periodStart.toISOString().slice(0, 10),
      periodEnd: i.periodEnd.toISOString().slice(0, 10),
      amount: Number(i.amount),
      discount: Number(i.discount),
      total: Number(i.total),
      currency: i.currency,
      dueDate: i.dueDate.toISOString().slice(0, 10),
      status: i.status,
      issuedAt: i.issuedAt,
      notes: i.notes,
      createdAt: i.createdAt,
      parent: { id: i.parent.id, name: `${i.parent.user.firstName} ${i.parent.user.lastName}`, email: i.parent.user.email },
      plan: i.tuitionPlan?.name ?? null,
      payments: i.payments.map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, status: p.status, paidAt: p.paidAt })),
    };
  }
}

@ApiTags("billing")
@ApiBearerAuth()
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Plans
  @Get("plans")
  listPlans() {
    return this.billing.listPlans();
  }

  @Post("plans")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  createPlan(@Body() dto: CreatePlanDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.createPlan(dto, actor);
  }

  @Patch("plans/:id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  updatePlan(@Param("id") id: string, @Body() dto: Partial<CreatePlanDto>, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.updatePlan(id, dto, actor);
  }

  // Invoices
  @Get("invoices")
  listInvoices(@Query() query: QueryInvoicesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.listInvoices(query, user);
  }

  @Get("invoices/:id")
  getInvoice(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.getInvoice(id, user);
  }

  @Post("invoices")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.createInvoice(dto, actor);
  }

  @Post("invoices/:id/payments")
  recordPayment(@Param("id") id: string, @Body() dto: RecordPaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.billing.recordPayment(id, dto, actor);
  }

  @Get("invoices/:id/pdf")
  invoicePdf(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    return this.billing.invoicePdf(id, user, res);
  }

  @Get("reports/revenue")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  revenue(@Query("from") from?: string, @Query("to") to?: string) {
    return this.billing.revenueReport(from, to);
  }
}

@Module({
  controllers: [BillingController],
  providers: [BillingService, MockPaymentProvider, StripePaymentProvider],
  exports: [BillingService],
})
export class BillingModule {}
