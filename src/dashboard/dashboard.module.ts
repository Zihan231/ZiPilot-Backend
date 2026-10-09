import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { buildApplicationWhere } from '../applications/application-filters';
import { LIST_INCLUDE } from '../applications/applications.service';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { resolveRange, safeZone, startOfToday } from '../common/dates';
import { RawQuery, str } from '../common/query';
import { buildWishlistWhere } from '../wishlist/wishlist.module';
import { PrismaService } from '../prisma/prisma.module';

type Q = Record<string, string>;

interface CardDef {
  key: string;
  label: string;
  target: 'applications' | 'wishlist';
  query: Q;
  /** true → card ignores the historical date filter (forward-looking / current-state metric). */
  live?: boolean;
}

const APP_SELECT = {
  id: true,
  company: true,
  position: true,
  status: true,
  jobUrl: true,
  recruiterName: true,
  recruiterEmail: true,
  recruiterLinkedin: true,
  appliedAt: true,
  lastActivityAt: true,
} as const;

const RANGE_LABEL: Record<string, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  thisYear: 'This year',
  all: 'All time',
  custom: 'Custom range',
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normalises the analytics date filter into application query params. */
  private rangeQuery(q: RawQuery): Q {
    const range = str(q, 'range') ?? '30d';
    if (range === 'all') return {};
    const out: Q = { applied: range };
    if (range === 'custom') {
      const from = str(q, 'from');
      const to = str(q, 'to');
      if (from) out.appliedFrom = from;
      if (to) out.appliedTo = to;
    }
    return out;
  }

  private rangeInfo(q: RawQuery, tz: string) {
    const range = str(q, 'range') ?? '30d';
    const r = resolveRange(range, str(q, 'from'), str(q, 'to'), tz);
    return {
      key: range,
      label: RANGE_LABEL[range] ?? range,
      from: r.gte ? DateTime.fromJSDate(r.gte).setZone(safeZone(tz)).toISODate() : null,
      to: r.lt ? DateTime.fromJSDate(r.lt).setZone(safeZone(tz)).minus({ days: 1 }).toISODate() : null,
    };
  }

  async overview(user: AuthUser, q: RawQuery) {
    const r = this.rangeQuery(q);
    const cards: CardDef[] = [
      { key: 'total', label: 'Total Applications', target: 'applications', query: { ...r } },
      { key: 'week', label: 'Applied This Week', target: 'applications', query: { applied: 'thisWeek' }, live: true },
      { key: 'month', label: 'Applied This Month', target: 'applications', query: { applied: 'thisMonth' }, live: true },
      { key: 'awaiting', label: 'Awaiting Response', target: 'applications', query: { ...r, status: 'APPLIED' } },
      { key: 'screening', label: 'Screening / In Review', target: 'applications', query: { ...r, status: 'SCREENING,IN_REVIEW' } },
      { key: 'interviews', label: 'Interviews Scheduled', target: 'applications', query: { interview: 'UPCOMING' }, live: true },
      { key: 'offers', label: 'Offers Received', target: 'applications', query: { ...r, status: 'OFFER,ACCEPTED' } },
      { key: 'rejected', label: 'Rejected', target: 'applications', query: { ...r, status: 'REJECTED' } },
      { key: 'wishlist', label: 'Wishlist Jobs', target: 'wishlist', query: { state: 'open' }, live: true },
      { key: 'deadlines', label: 'Upcoming Deadlines', target: 'wishlist', query: { state: 'open', deadline: '7d' }, live: true },
      { key: 'followups', label: 'Pending Follow-ups', target: 'applications', query: { followUp: 'pending' }, live: true },
      { key: 'tasks', label: 'Pending Assessments / Tasks', target: 'applications', query: { task: 'PENDING' }, live: true },
    ];

    const today = startOfToday(user.tz);

    const [counts, recentApplications, wishlistDeadlines, followUps, upcomingInterviews, pendingTasks, followUpsDueCount] = await Promise.all([
      Promise.all(
        cards.map((c) =>
          c.target === 'applications'
            ? this.prisma.application.count({ where: buildApplicationWhere(user.id, c.query, user.tz) })
            : this.prisma.wishlistJob.count({ where: buildWishlistWhere(user.id, c.query, user.tz) }),
        ),
      ),
      this.prisma.application.findMany({
        where: buildApplicationWhere(user.id, r, user.tz),
        orderBy: [{ appliedAt: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        include: LIST_INCLUDE,
      }),
      this.prisma.wishlistJob.findMany({
        where: { userId: user.id, appliedAt: null, deadline: { gte: today.toJSDate() } },
        orderBy: [{ deadline: 'asc' }, { priority: 'asc' }],
        take: 6,
      }),
      this.prisma.followUp.findMany({
        where: { userId: user.id, completedAt: null },
        orderBy: { dueAt: 'asc' },
        take: 6,
        include: { application: { select: APP_SELECT } },
      }),
      this.prisma.interview.findMany({
        where: { userId: user.id, status: 'SCHEDULED', scheduledAt: { gte: DateTime.now().minus({ hours: 2 }).toJSDate() } },
        orderBy: { scheduledAt: 'asc' },
        take: 6,
        include: { application: { select: APP_SELECT } },
      }),
      this.prisma.task.findMany({
        where: { userId: user.id, status: 'PENDING' },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
        take: 6,
        include: { application: { select: APP_SELECT } },
      }),
      this.prisma.followUp.count({ where: { userId: user.id, completedAt: null, dueAt: { lt: today.plus({ days: 1 }).toJSDate() } } }),
    ]);

    return {
      range: this.rangeInfo(q, user.tz),
      cards: cards.map((c, i) => ({ ...c, count: counts[i] })),
      followUpsDueCount,
      recentApplications,
      wishlistDeadlines,
      followUps,
      upcomingInterviews,
      pendingTasks,
    };
  }

  /** "Needs my attention" — always current, never filtered by the analytics date range. */
  async attention(user: AuthUser) {
    const tz = user.tz;
    const today = startOfToday(tz);
    const tomorrow = today.plus({ days: 1 }).toJSDate();
    const take = 8;

    const dueSoonWhere: Prisma.WishlistJobWhereInput = { userId: user.id, appliedAt: null, deadline: { gte: today.toJSDate(), lt: today.plus({ days: 3 }).toJSDate() } };
    const overdueWhere: Prisma.WishlistJobWhereInput = { userId: user.id, appliedAt: null, deadline: { lt: today.toJSDate() } };
    const followWhere: Prisma.FollowUpWhereInput = { userId: user.id, completedAt: null, dueAt: { lt: tomorrow } };
    const interviewWhere: Prisma.InterviewWhereInput = {
      userId: user.id,
      status: 'SCHEDULED',
      scheduledAt: { gte: DateTime.now().minus({ hours: 2 }).toJSDate(), lt: today.plus({ days: 14 }).toJSDate() },
    };
    const taskWhere: Prisma.TaskWhereInput = { userId: user.id, status: 'PENDING' };
    const staleWhere = buildApplicationWhere(user.id, { activeOnly: 'yes', inactive: '7' }, tz);
    const replyWhere = buildApplicationWhere(user.id, { needsReply: 'yes' }, tz);

    const [dueSoon, dueSoonCount, overdue, overdueCount, follow, followCount, interviews, interviewCount, tasks, taskCount, stale, staleCount, reply, replyCount] =
      await this.prisma.$transaction([
        this.prisma.wishlistJob.findMany({ where: dueSoonWhere, orderBy: { deadline: 'asc' }, take }),
        this.prisma.wishlistJob.count({ where: dueSoonWhere }),
        this.prisma.wishlistJob.findMany({ where: overdueWhere, orderBy: { deadline: 'desc' }, take }),
        this.prisma.wishlistJob.count({ where: overdueWhere }),
        this.prisma.followUp.findMany({ where: followWhere, orderBy: { dueAt: 'asc' }, take, include: { application: { select: APP_SELECT } } }),
        this.prisma.followUp.count({ where: followWhere }),
        this.prisma.interview.findMany({ where: interviewWhere, orderBy: { scheduledAt: 'asc' }, take, include: { application: { select: APP_SELECT } } }),
        this.prisma.interview.count({ where: interviewWhere }),
        this.prisma.task.findMany({ where: taskWhere, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }], take, include: { application: { select: APP_SELECT } } }),
        this.prisma.task.count({ where: taskWhere }),
        this.prisma.application.findMany({ where: staleWhere, orderBy: { lastActivityAt: 'asc' }, take, select: APP_SELECT }),
        this.prisma.application.count({ where: staleWhere }),
        this.prisma.application.findMany({ where: replyWhere, orderBy: { recruiterRepliedAt: { sort: 'desc', nulls: 'last' } }, take, select: { ...APP_SELECT, recruiterRepliedAt: true } }),
        this.prisma.application.count({ where: replyWhere }),
      ]);

    const sections = {
      wishlistDueSoon: { items: dueSoon, total: dueSoonCount },
      wishlistOverdue: { items: overdue, total: overdueCount },
      followUpsDue: { items: follow, total: followCount },
      upcomingInterviews: { items: interviews, total: interviewCount },
      pendingTasks: { items: tasks, total: taskCount },
      staleApplications: { items: stale, total: staleCount },
      needsReply: { items: reply, total: replyCount },
    };
    const total = dueSoonCount + overdueCount + followCount + interviewCount + taskCount + staleCount + replyCount;
    return { total, ...sections };
  }

  async analytics(user: AuthUser, q: RawQuery) {
    const tz = safeZone(user.tz);
    const rq = this.rangeQuery(q);
    const where = buildApplicationWhere(user.id, rq, tz);
    const range = resolveRange(str(q, 'range') ?? '30d', str(q, 'from'), str(q, 'to'), tz);

    const [statusGroups, platformGroups, platformInterviews, platformOffers, jobTypeGroups, workplaceGroups, total, responded, screened, interviewed, offered, contacted, replied, firstApp] =
      await this.prisma.$transaction([
        this.prisma.application.groupBy({ by: ['status'], where, _count: { _all: true }, orderBy: { status: 'asc' } }),
        this.prisma.application.groupBy({ by: ['platform'], where, _count: { _all: true }, orderBy: { platform: 'asc' } }),
        this.prisma.application.groupBy({ by: ['platform'], where: { AND: [where, { interviewedAt: { not: null } }] }, _count: { _all: true }, orderBy: { platform: 'asc' } }),
        this.prisma.application.groupBy({ by: ['platform'], where: { AND: [where, { offeredAt: { not: null } }] }, _count: { _all: true }, orderBy: { platform: 'asc' } }),
        this.prisma.application.groupBy({ by: ['jobType'], where, _count: { _all: true }, orderBy: { jobType: 'asc' } }),
        this.prisma.application.groupBy({ by: ['workplace'], where, _count: { _all: true }, orderBy: { workplace: 'asc' } }),
        this.prisma.application.count({ where }),
        this.prisma.application.count({ where: { AND: [where, { respondedAt: { not: null } }] } }),
        this.prisma.application.count({ where: { AND: [where, { screenedAt: { not: null } }] } }),
        this.prisma.application.count({ where: { AND: [where, { interviewedAt: { not: null } }] } }),
        this.prisma.application.count({ where: { AND: [where, { offeredAt: { not: null } }] } }),
        this.prisma.application.count({ where: buildApplicationWhere(user.id, { ...rq, contacted: 'yes' }, tz) }),
        this.prisma.application.count({ where: buildApplicationWhere(user.id, { ...rq, contacted: 'yes', replied: 'yes' }, tz) }),
        this.prisma.application.findFirst({ where, orderBy: { appliedAt: 'asc' }, select: { appliedAt: true } }),
      ]);

    // Follow-up completion: follow-ups that came due within the range (up to today).
    const today = startOfToday(tz);
    const dueBefore = range.lt && range.lt < today.plus({ days: 1 }).toJSDate() ? range.lt : today.plus({ days: 1 }).toJSDate();
    const fuWhere: Prisma.FollowUpWhereInput = { userId: user.id, dueAt: { lt: dueBefore, ...(range.gte ? { gte: range.gte } : {}) } };
    const [fuDue, fuDone] = await Promise.all([
      this.prisma.followUp.count({ where: fuWhere }),
      this.prisma.followUp.count({ where: { ...fuWhere, completedAt: { not: null } } }),
    ]);

    // Volume series — aggregated in SQL in the user's timezone, zero-filled here.
    const start = range.gte ? DateTime.fromJSDate(range.gte).setZone(tz) : firstApp ? DateTime.fromJSDate(firstApp.appliedAt).setZone(tz).startOf('day') : today;
    const end = range.lt ? DateTime.fromJSDate(range.lt).setZone(tz).minus({ days: 1 }) : today;
    const spanDays = Math.max(1, Math.round(end.diff(start, 'days').days) + 1);
    const requested = str(q, 'granularity');
    const unit: 'day' | 'week' | 'month' =
      requested === 'day' || requested === 'week' || requested === 'month' ? requested : spanDays <= 31 ? 'day' : spanDays <= 182 ? 'week' : 'month';
    const volume = await this.volume(user.id, unit, tz, range.gte, range.lt, start, end);

    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const interviewsBy = new Map(platformInterviews.map((p) => [p.platform, (p._count as { _all: number })._all]));
    const offersBy = new Map(platformOffers.map((p) => [p.platform, (p._count as { _all: number })._all]));
    const c = (g: { _count?: unknown }) => (g._count as { _all: number })._all;

    return {
      range: this.rangeInfo(q, tz),
      rangeQuery: rq,
      granularity: unit,
      total,
      volume,
      statusDistribution: statusGroups.map((g) => ({ status: g.status, count: c(g) })).sort((a, b) => b.count - a.count),
      funnel: [
        { stage: 'Applied', key: 'applied', count: total },
        { stage: 'Responded', key: 'responded', count: responded },
        { stage: 'Screening', key: 'screened', count: screened },
        { stage: 'Interview', key: 'interviewed', count: interviewed },
        { stage: 'Offer', key: 'offered', count: offered },
      ],
      conversion: {
        responseRate: pct(responded, total),
        interviewRate: pct(interviewed, total),
        offerRate: pct(offered, total),
        interviewToOffer: pct(offered, interviewed),
      },
      byPlatform: platformGroups
        .map((g) => {
          const t = c(g);
          const iv = interviewsBy.get(g.platform) ?? 0;
          return { platform: g.platform, total: t, interviews: iv, offers: offersBy.get(g.platform) ?? 0, interviewRate: pct(iv, t) };
        })
        .sort((a, b) => b.total - a.total),
      byJobType: jobTypeGroups.map((g) => ({ jobType: g.jobType, count: c(g) })).sort((a, b) => b.count - a.count),
      byWorkplace: workplaceGroups.map((g) => ({ workplace: g.workplace, count: c(g) })).sort((a, b) => b.count - a.count),
      recruiterResponse: { contacted, replied, rate: pct(replied, contacted) },
      followUpCompletion: { due: fuDue, completed: fuDone, rate: pct(fuDone, fuDue) },
    };
  }

  private async volume(userId: string, unit: 'day' | 'week' | 'month', tz: string, gte: Date | undefined, lt: Date | undefined, start: DateTime, end: DateTime) {
    const conds = [Prisma.sql`"userId" = ${userId}`];
    if (gte) conds.push(Prisma.sql`"appliedAt" >= ${gte}`);
    if (lt) conds.push(Prisma.sql`"appliedAt" < ${lt}`);
    const rows = await this.prisma.$queryRaw<{ bucket: string; count: number }[]>`
      SELECT to_char(date_trunc(${unit}, ("appliedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket,
             count(*)::int AS count
      FROM "Application"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY 1
      ORDER BY 1`;
    const map = new Map(rows.map((r) => [r.bucket, r.count]));
    const out: { bucket: string; from: string; to: string; count: number }[] = [];
    let cursor = start.startOf(unit === 'week' ? 'week' : unit);
    const last = end.startOf(unit === 'week' ? 'week' : unit);
    let guard = 0;
    while (cursor <= last && guard++ < 1000) {
      const key = cursor.toISODate()!;
      const next = cursor.plus({ [unit + 's']: 1 } as never);
      out.push({ bucket: key, from: key, to: next.minus({ days: 1 }).toISODate()!, count: map.get(key) ?? 0 });
      cursor = next;
    }
    return out;
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('overview') overview(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.overview(u, q); }
  @Get('attention') attention(@CurrentUser() u: AuthUser) { return this.svc.attention(u); }
  @Get('analytics') analytics(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.analytics(u, q); }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
