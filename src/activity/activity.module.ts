import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { ActivityType, Prisma } from '@prisma/client';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { rangeToPrisma, resolveRange } from '../common/dates';
import { list, pagination, RawQuery, str } from '../common/query';
import { PrismaService } from '../prisma/prisma.module';

type Tx = Prisma.TransactionClient | PrismaService;

/** UI-facing activity groups → stored activity types. */
export const ACTIVITY_GROUPS: Record<string, ActivityType[]> = {
  applications: ['APPLICATION_CREATED'],
  wishlist: ['WISHLIST_ADDED', 'WISHLIST_APPLIED', 'REMINDER_SENT'],
  status: ['STATUS_CHANGED'],
  recruiter: ['RECRUITER_MESSAGE', 'RECRUITER_REPLY'],
  interviews: ['INTERVIEW_SCHEDULED', 'INTERVIEW_UPDATED'],
  followups: ['FOLLOWUP_SCHEDULED', 'FOLLOWUP_COMPLETED'],
  tasks: ['TASK_ADDED', 'TASK_SUBMITTED', 'TASK_COMPLETED'],
  updates: ['APPLICATION_UPDATED'],
};

export interface LogInput {
  type: ActivityType;
  message: string;
  applicationId?: string | null;
  wishlistJobId?: string | null;
  meta?: Prisma.InputJsonValue;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records activity entries and bumps the application's lastActivityAt. */
  async log(userId: string, entries: LogInput | LogInput[], tx: Tx = this.prisma) {
    const arr = Array.isArray(entries) ? entries : [entries];
    if (!arr.length) return;
    await tx.activity.createMany({
      data: arr.map((e) => ({
        userId,
        type: e.type,
        message: e.message,
        applicationId: e.applicationId ?? null,
        wishlistJobId: e.wishlistJobId ?? null,
        meta: e.meta,
      })),
    });
    const appIds = [...new Set(arr.map((e) => e.applicationId).filter((x): x is string => !!x))];
    if (appIds.length) {
      await tx.application.updateMany({ where: { id: { in: appIds }, userId }, data: { lastActivityAt: new Date() } });
    }
  }

  async list(user: AuthUser, q: RawQuery) {
    const { page, pageSize, skip, take } = pagination(q, 30);
    const groups = list(q, 'types');
    const types = groups.flatMap((g) => ACTIVITY_GROUPS[g] ?? []);
    const where: Prisma.ActivityWhereInput = { userId: user.id };
    if (types.length) where.type = { in: types };
    const createdAt = rangeToPrisma(resolveRange(str(q, 'range'), str(q, 'from'), str(q, 'to'), user.tz));
    if (createdAt) where.createdAt = createdAt;
    const applicationId = str(q, 'applicationId');
    if (applicationId) where.applicationId = applicationId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          application: { select: { id: true, company: true, position: true } },
          wishlistJob: { select: { id: true, company: true, position: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: RawQuery) {
    return this.activity.list(user, q);
  }
}

@Global()
@Module({ providers: [ActivityService], controllers: [ActivityController], exports: [ActivityService] })
export class ActivityModule {}
