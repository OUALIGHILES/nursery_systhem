import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { CommonModule } from './common/common.module.js';
import { AccessModule } from './common/access.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { ActivitiesModule } from './activities/activities.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ChildrenModule } from './children/children.module.js';
import { ClassroomsModule } from './classrooms/classrooms.module.js';
import { HealthModule } from './health/health.module.js';
import { MealsModule } from './meals/meals.module.js';
import { ParentsModule } from './parents/parents.module.js';
import { StaffModule } from './staff/staff.module.js';
import { UsersModule } from './users/users.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { MailAdminModule } from './common/mail.admin.module.js';
import { OutboxAdminModule } from './worker/outbox.admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CommonModule,
    AccessModule,
    AuthModule,
    MessagingModule,
    ActivitiesModule,
    AttendanceModule,
    BillingModule,
    ChildrenModule,
    ClassroomsModule,
    HealthModule,
    MealsModule,
    ParentsModule,
    StaffModule,
    UsersModule,
    EnrollmentModule,
    NotificationsModule,
    MailAdminModule,
    OutboxAdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
