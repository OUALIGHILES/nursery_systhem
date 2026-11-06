import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { normalizePage, toPage } from "../common/pagination.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import type { CreateUserDto, QueryUsersDto, UpdateUserDto } from "./dto.js";
import type { RoleName } from "../generated/prisma/enums.js";

const ADMIN_ROLES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "DIRECTOR"];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async list(query: QueryUsersDto) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const where = {
      deletedAt: null,
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: "insensitive" as const } },
              { firstName: { contains: query.q, mode: "insensitive" as const } },
              { lastName: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true, parentProfile: true, staffProfile: true },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(items.map((u) => this.publicUser(u)), total, page, pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: true,
        parentProfile: { include: { children: { include: { child: true } } } },
        staffProfile: { include: { classrooms: { include: { classroom: true } } } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return this.publicUser(user, true);
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("A user with this email already exists");

    if ((dto.role === "TEACHER" || dto.role === "STAFF" || dto.role === "DIRECTOR") && !dto.jobTitle) {
      throw new BadRequestException("jobTitle is required for staff roles");
    }

    const tempPassword = dto.temporaryPassword ?? randomBytes(9).toString("base64url") + "A1";
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    const role = await this.prisma.role.upsert({
      where: { name: dto.role },
      update: {},
      create: { name: dto.role, description: `${dto.role} role` },
    });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          roleId: role.id,
          mustChangePassword: true,
        },
      });
      if (dto.role === "PARENT") {
        await tx.parent.create({ data: { userId: created.id, address: dto.address ?? null } });
      } else {
        await tx.staff.create({
          data: { userId: created.id, jobTitle: dto.jobTitle ?? dto.role, hiredAt: new Date() },
        });
      }
      return created;
    });

    await this.mail.send(
      email,
      "Your Little Steps Nursery account",
      `Hello ${dto.firstName},\n\nAn account has been created for you.\nEmail: ${email}\nTemporary password: ${tempPassword}\nPlease sign in and change your password immediately.`,
    );
    await this.audit.log({ actorId: actor.id, action: "user.created", entity: "User", entityId: user.id, metadata: { role: dto.role } });
    const full = await this.prisma.user.findUnique({ where: { id: user.id }, include: { role: true, parentProfile: true, staffProfile: true } });
    return this.publicUser(full!, true);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("User not found");
    if (!ADMIN_ROLES.includes(actor.role) && actor.id !== id) {
      throw new ForbiddenException("You can only update your own profile");
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        isActive: actor.role === "PARENT" || actor.role === "TEACHER" || actor.role === "STAFF" ? existing.isActive : dto.isActive,
      },
      include: { role: true, parentProfile: true, staffProfile: true },
    });
    await this.audit.log({ actorId: actor.id, action: "user.updated", entity: "User", entityId: id });
    return this.publicUser(user);
  }

  /** Admin resets a user's password to a temporary one. */
  async adminResetPassword(id: string, temporaryPassword: string | undefined, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("User not found");
    const temp = temporaryPassword ?? randomBytes(9).toString("base64url") + "A1";
    const passwordHash = await argon2.hash(temp, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.mail.send(existing.email, "Your password was reset", `Hello ${existing.firstName},\n\nAn administrator reset your password.\nTemporary password: ${temp}\nPlease sign in and change it immediately.`);
    await this.audit.log({ actorId: actor.id, action: "user.password_reset", entity: "User", entityId: id });
    return { message: "Password reset. Temporary credentials sent by email." };
  }

  async deactivate(id: string, actor: AuthenticatedUser) {
    if (id === actor.id) throw new BadRequestException("You cannot deactivate your own account");
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("User not found");
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: actor.id, action: "user.deactivated", entity: "User", entityId: id });
    return { message: "User deactivated" };
  }

  private publicUser(u: {
    id: string; email: string; firstName: string; lastName: string; phone: string | null;
    isActive: boolean; mustChangePassword: boolean; emailVerifiedAt: Date | null; lastLoginAt: Date | null;
    createdAt: Date; role: { name: RoleName };
    parentProfile?: { id: string; address: string | null; occupation: string | null } | null;
    staffProfile?: { id: string; jobTitle: string; department: string | null; hiredAt: Date } | null;
  }, detailed = false) {
    const base = {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      role: u.role.name,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      parentId: u.parentProfile?.id ?? null,
      staffId: u.staffProfile?.id ?? null,
    };
    if (!detailed) return base;
    return {
      ...base,
      emailVerifiedAt: u.emailVerifiedAt,
      parent: u.parentProfile ? { id: u.parentProfile.id, address: u.parentProfile.address, occupation: u.parentProfile.occupation } : null,
      staff: u.staffProfile ? { id: u.staffProfile.id, jobTitle: u.staffProfile.jobTitle, department: u.staffProfile.department, hiredAt: u.staffProfile.hiredAt } : null,
    };
  }
}
