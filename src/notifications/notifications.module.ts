import { Controller, Get, Injectable, Logger, Module } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { ActivityService } from '../activity/activity.module';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { APP_URL } from '../common/config';
import { safeZone } from '../common/dates';
import { PrismaService } from '../prisma/prisma.module';
import { reminderEmail, ReminderItem } from './email-templates';
import { MailService } from './mail.service';

const TZ = safeZone(process.env.REMINDER_TIMEZONE || 'Asia/Dhaka');
const HOUR = Number(process.env.REMINDER_HOUR ?? 8);
const PRIORITY: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

interface Due {
  kind: string;
  item: ReminderItem;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
  ) {}

  get scheduleLabel() {
    const t = DateTime.fromObject({ hour: HOUR }, { zone: TZ }).toFormat('h:mm a');
    return `daily at ${t} (${TZ})`;
  }

  /**
   * Runs hourly from the reminder hour until evening. The first run of the day sends reminders;
   * later runs only catch up if the server was offline at the scheduled time. ReminderLog rows
   * guarantee nothing is sent twice.
   */
  @Cron(`0 ${HOUR}-22 * * *`, { name: 'wishlist-reminders', timeZone: TZ })
  async scheduled() {
    if (!this.mail.configured || this.running) return;
    this.running = true;
    try {
      const users = await this.prisma.wishlistJob.findMany({
        where: { appliedAt: null, OR: [{ deadline: { not: null } }, { reminderAt: { not: null } }] },
        distinct: ['userId'],
        select: { userId: true },
      });
      for (const { userId } of users) {
        try {
          await this.sendForUser(userId);
        } catch (e) {
          this.logger.error(`Reminder run failed for user ${userId}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Works out which reminders are due right now for one user (in the reminder timezone). */
  async dueFor(userId: string): Promise<Due[]> {
    const now = DateTime.now().setZone(TZ);
    const today = now.startOf('day');
    const horizon = today.plus({ days: 4 }).toJSDate();
    const jobs = await this.prisma.wishlistJob.findMany({
      where: {
        userId,
        appliedAt: null,
        OR: [{ deadline: { gte: today.toJSDate(), lt: horizon } }, { reminderAt: { lte: now.toJSDate() } }],
      },
      include: { reminderLogs: { select: { kind: true } } },
      orderBy: { deadline: { sort: 'asc', nulls: 'last' } },
    });

    const due: Due[] = [];
    for (const j of jobs) {
      const sent = new Set(j.reminderLogs.map((l) => l.kind));
      const deadline = j.deadline ? DateTime.fromJSDate(j.deadline).setZone(TZ).startOf('day') : null;
      const deadlineLabel = deadline ? deadline.toFormat('EEE, d LLL yyyy') : 'No deadline';
      const base = { id: j.id, company: j.company, position: j.position, deadlineLabel, priority: PRIORITY[j.priority] ?? j.priority, jobUrl: j.jobUrl };

      if (deadline && deadline >= today) {
        const days = Math.round(deadline.diff(today, 'days').days);
        const date = deadline.toISODate();
        // 1-day reminder covers "today" and "tomorrow"; 3-day reminder covers 2–3 days out.
        const kind = days <= 1 ? `deadline-1d:${date}` : days <= 3 ? `deadline-3d:${date}` : null;
        if (kind && !sent.has(kind)) {
          const urgency: ReminderItem['urgency'] = days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'soon';
          const whenLabel = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
          due.push({ kind, item: { ...base, urgency, whenLabel } });
          continue; // one entry per job per email
        }
      }
      if (j.reminderAt && j.reminderAt <= now.toJSDate()) {
        const kind = `custom:${DateTime.fromJSDate(j.reminderAt).setZone(TZ).toISODate()}`;
        if (!sent.has(kind)) due.push({ kind, item: { ...base, urgency: 'custom', whenLabel: 'Your reminder' } });
      }
    }
    return due;
  }

  /** Sends one combined email for everything due, then records each reminder. */
  async sendForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) return { sent: 0, reason: 'no-email' as const };
    const due = await this.dueFor(userId);
    if (!due.length) return { sent: 0, reason: 'nothing-due' as const };

    const name = user.displayName?.split(' ')[0] || user.email.split('@')[0];
    const { subject, html, text } = reminderEmail(name, due.map((d) => d.item), APP_URL);
    await this.mail.send(user.email, subject, html, text);

    await this.prisma.$transaction(async (tx) => {
      await tx.reminderLog.createMany({ data: due.map((d) => ({ userId, wishlistJobId: d.item.id, kind: d.kind })), skipDuplicates: true });
      await tx.wishlistJob.updateMany({ where: { id: { in: due.map((d) => d.item.id) } }, data: { reminderSent: true } });
      await this.activity.log(
        userId,
        due.map((d) => ({
          type: 'REMINDER_SENT' as const,
          wishlistJobId: d.item.id,
          message: `Email reminder sent: ${d.item.company} — ${d.item.whenLabel.toLowerCase()}`,
          meta: { kind: d.kind } as Prisma.InputJsonValue,
        })),
        tx,
      );
    });
    return { sent: due.length, reason: 'sent' as const, to: user.email };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const [u, pending, lastSent] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }),
      this.reminders.dueFor(user.id),
      this.prisma.reminderLog.findFirst({ where: { userId: user.id }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
    ]);
    return {
      configured: this.mail.configured,
      recipient: u?.email ?? null,
      schedule: this.reminders.scheduleLabel,
      pendingNow: pending.length,
      lastSentAt: lastSent?.sentAt ?? null,
    };
  }
}

@Module({ controllers: [NotificationsController], providers: [MailService, RemindersService] })
export class NotificationsModule {}
