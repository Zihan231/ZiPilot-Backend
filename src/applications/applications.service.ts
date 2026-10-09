import { Injectable, NotFoundException } from '@nestjs/common';
import { Application, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { ActivityService, LogInput } from '../activity/activity.module';
import { CsvColumn, pickColumns, toCsv } from '../common/csv';
import { list, pagination, RawQuery } from '../common/query';
import { milestonesFor, STATUS_LABEL } from '../common/status';
import { PrismaService } from '../prisma/prisma.module';
import { CreateApplicationDto, UpdateApplicationDto } from './application.dto';
import { buildApplicationOrder, buildApplicationWhere } from './application-filters';

/** Relations loaded for list rows — batched by Prisma (no N+1). */
export const LIST_INCLUDE = {
  followUps: { where: { completedAt: null }, orderBy: { dueAt: 'asc' }, take: 1 },
  interviews: { where: { status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, take: 1 },
  _count: { select: { tasks: { where: { status: 'PENDING' } }, interviews: true } },
} satisfies Prisma.ApplicationInclude;

const MSG_LABEL: Record<string, string> = { NOT_SENT: 'not sent', SENT: 'sent', SEEN: 'seen', REPLIED: 'replied' };

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(user: AuthUser, q: RawQuery) {
    const where = buildApplicationWhere(user.id, q, user.tz);
    const { page, pageSize, skip, take } = pagination(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({ where, orderBy: buildApplicationOrder(q), skip, take, include: LIST_INCLUDE }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Distinct values for searchable multi-select filters. */
  async facets(user: AuthUser) {
    const base = { userId: user.id };
    const [companies, countries, cities, currencies, resumes] = await Promise.all([
      this.prisma.application.groupBy({ by: ['company'], where: base, _count: { _all: true }, orderBy: { company: 'asc' } }),
      this.prisma.application.groupBy({ by: ['country'], where: { ...base, country: { not: null } }, orderBy: { country: 'asc' } }),
      this.prisma.application.groupBy({ by: ['city'], where: { ...base, city: { not: null } }, orderBy: { city: 'asc' } }),
      this.prisma.application.groupBy({ by: ['currency'], where: { ...base, currency: { not: null } }, orderBy: { currency: 'asc' } }),
      this.prisma.application.groupBy({ by: ['resumeVersion'], where: { ...base, resumeVersion: { not: null } }, orderBy: { resumeVersion: 'asc' } }),
    ]);
    return {
      companies: companies.map((c) => ({ value: c.company, count: c._count._all })),
      countries: countries.map((c) => c.country!),
      cities: cities.map((c) => c.city!),
      currencies: currencies.map((c) => c.currency!),
      resumeVersions: resumes.map((r) => r.resumeVersion!),
    };
  }

  async get(user: AuthUser, id: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, userId: user.id },
      include: {
        followUps: { orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { dueAt: 'asc' }] },
        interviews: { orderBy: { scheduledAt: 'asc' } },
        tasks: { orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }] },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
        wishlistJob: { select: { id: true, createdAt: true } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  private async own(user: AuthUser, id: string): Promise<Application> {
    const app = await this.prisma.application.findFirst({ where: { id, userId: user.id } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  private toData(dto: Partial<CreateApplicationDto>) {
    const { appliedAt, deadline, ...rest } = dto;
    const data: Prisma.ApplicationUncheckedUpdateInput = { ...rest };
    if (appliedAt !== undefined) data.appliedAt = new Date(appliedAt);
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
    if (data.currency) data.currency = String(data.currency).toUpperCase();
    return data;
  }

  /** Sets timestamps that accompany recruiter-outreach state changes. */
  private outreachTimestamps(prev: Partial<Application>, dto: Partial<CreateApplicationDto>, at: Date) {
    const data: Prisma.ApplicationUncheckedUpdateInput = {};
    for (const n of [1, 2, 3] as const) {
      const key = `msg${n}Status` as const;
      const next = dto[key];
      if (next && next !== 'NOT_SENT' && (prev[key] ?? 'NOT_SENT') === 'NOT_SENT') data[`msg${n}SentAt`] = at;
      if (next === 'NOT_SENT') data[`msg${n}SentAt`] = null;
      if (next === 'REPLIED' && dto.recruiterReplied === undefined && !prev.recruiterReplied) {
        data.recruiterReplied = true;
      }
    }
    const replied = (data.recruiterReplied as boolean | undefined) ?? dto.recruiterReplied;
    if (replied === true && !prev.recruiterReplied) {
      data.recruiterRepliedAt = at;
      if (!prev.respondedAt) data.respondedAt = at;
      if (dto.needsReply === undefined) data.needsReply = true;
    }
    if (replied === false) data.recruiterRepliedAt = null;
    return data;
  }

  async create(user: AuthUser, dto: CreateApplicationDto, opts: { wishlistJobId?: string } = {}) {
    const now = new Date();
    const base = this.toData(dto);
    const status = dto.status ?? 'APPLIED';
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          ...(base as Prisma.ApplicationUncheckedCreateInput),
          ...(milestonesFor(status, {}, now) as object),
          ...(this.outreachTimestamps({}, dto, now) as object),
          status,
          userId: user.id,
          wishlistJobId: opts.wishlistJobId ?? null,
          lastActivityAt: now,
        },
      });
      const logs: LogInput[] = [
        { type: 'APPLICATION_CREATED', applicationId: app.id, message: `Applied to ${app.position} at ${app.company}` },
      ];
      if (status !== 'APPLIED') {
        logs.push({ type: 'STATUS_CHANGED', applicationId: app.id, message: `Status set to ${STATUS_LABEL[status]}`, meta: { to: status } });
      }
      await this.activity.log(user.id, logs, tx);
      return app;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateApplicationDto) {
    const prev = await this.own(user, id);
    const now = new Date();
    const data: Prisma.ApplicationUncheckedUpdateInput = {
      ...this.toData(dto),
      ...this.outreachTimestamps(prev, dto, now),
      lastActivityAt: now,
    };
    const logs: LogInput[] = [];
    const label = `${prev.position} at ${prev.company}`;

    if (dto.status && dto.status !== prev.status) {
      Object.assign(data, milestonesFor(dto.status, prev, now));
      logs.push({
        type: 'STATUS_CHANGED',
        applicationId: id,
        message: `${label}: ${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[dto.status]}`,
        meta: { from: prev.status, to: dto.status },
      });
    }
    if (dto.connectionStatus && dto.connectionStatus !== prev.connectionStatus) {
      logs.push({
        type: 'RECRUITER_MESSAGE',
        applicationId: id,
        message: `Connection request ${dto.connectionStatus.toLowerCase().replace('_', ' ')}${prev.recruiterName ? ` — ${prev.recruiterName}` : ''}`,
        meta: { connection: dto.connectionStatus },
      });
    }
    for (const n of [1, 2, 3] as const) {
      const next = dto[`msg${n}Status`];
      if (next && next !== prev[`msg${n}Status`]) {
        logs.push({
          type: 'RECRUITER_MESSAGE',
          applicationId: id,
          message: `MSG-${n} ${MSG_LABEL[next]} — ${label}`,
          meta: { message: n, status: next },
        });
      }
    }
    if (data.recruiterReplied === true && !prev.recruiterReplied) {
      logs.push({
        type: 'RECRUITER_REPLY',
        applicationId: id,
        message: `${dto.recruiterName ?? prev.recruiterName ?? 'Recruiter'} replied — ${label}`,
      });
    }
    if (!logs.length) logs.push({ type: 'APPLICATION_UPDATED', applicationId: id, message: `Updated ${label}` });

    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.update({ where: { id }, data });
      await this.activity.log(user.id, logs, tx);
      return app;
    });
  }

  setStatus(user: AuthUser, id: string, status: Application['status']) {
    return this.update(user, id, { status });
  }

  async bulkStatus(user: AuthUser, ids: string[], status: Application['status']) {
    const apps = await this.prisma.application.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true } });
    for (const a of apps) await this.update(user, a.id, { status });
    return { updated: apps.length };
  }

  async remove(user: AuthUser, id: string) {
    await this.own(user, id);
    await this.prisma.application.delete({ where: { id } });
    return { ok: true };
  }

  async bulkRemove(user: AuthUser, ids: string[]) {
    const res = await this.prisma.application.deleteMany({ where: { id: { in: ids }, userId: user.id } });
    return { deleted: res.count };
  }

  async exportCsv(user: AuthUser, q: RawQuery) {
    const where = buildApplicationWhere(user.id, q, user.tz);
    const rows = await this.prisma.application.findMany({ where, orderBy: buildApplicationOrder(q), include: LIST_INCLUDE });
    const columns = pickColumns(APPLICATION_CSV_COLUMNS, list(q, 'columns'));
    return toCsv(rows, columns, user.tz);
  }
}

type Row = Prisma.ApplicationGetPayload<{ include: typeof LIST_INCLUDE }>;

export const APPLICATION_CSV_COLUMNS: CsvColumn<Row>[] = [
  { key: 'company', header: 'Company', value: (r) => r.company },
  { key: 'position', header: 'Position', value: (r) => r.position },
  { key: 'status', header: 'Status', value: (r) => STATUS_LABEL[r.status] },
  { key: 'appliedAt', header: 'Applied Date', value: (r) => r.appliedAt },
  { key: 'platform', header: 'Platform', value: (r) => r.platform },
  { key: 'appliedVia', header: 'Applied Via', value: (r) => r.appliedVia },
  { key: 'jobType', header: 'Job Type', value: (r) => r.jobType },
  { key: 'workplace', header: 'Workplace', value: (r) => r.workplace },
  { key: 'location', header: 'Location', value: (r) => [r.location, r.city, r.country].filter(Boolean).join(', ') },
  { key: 'salary', header: 'Salary', value: (r) => (r.salaryMin || r.salaryMax ? `${r.salaryMin ?? ''}-${r.salaryMax ?? ''} ${r.currency ?? ''}`.trim() : '') },
  { key: 'priority', header: 'Priority', value: (r) => r.priority },
  { key: 'deadline', header: 'Deadline', value: (r) => r.deadline },
  { key: 'resumeVersion', header: 'Resume Version', value: (r) => r.resumeVersion },
  { key: 'recruiter', header: 'Recruiter', value: (r) => r.recruiterName },
  { key: 'recruiterEmail', header: 'Recruiter Email', value: (r) => r.recruiterEmail },
  { key: 'recruiterLinkedin', header: 'Recruiter LinkedIn', value: (r) => r.recruiterLinkedin },
  { key: 'connection', header: 'Connection', value: (r) => r.connectionStatus },
  { key: 'messages', header: 'MSG-1/2/3', value: (r) => `${r.msg1Status}/${r.msg2Status}/${r.msg3Status}` },
  { key: 'replied', header: 'Recruiter Replied', value: (r) => r.recruiterReplied },
  { key: 'followUp', header: 'Next Follow-up', value: (r) => r.followUps[0]?.dueAt ?? null },
  { key: 'interview', header: 'Next Interview', value: (r) => r.interviews[0]?.scheduledAt ?? null },
  { key: 'lastActivityAt', header: 'Last Activity', value: (r) => r.lastActivityAt },
  { key: 'jobUrl', header: 'Job URL', value: (r) => r.jobUrl },
  { key: 'notes', header: 'Notes', value: (r) => r.notes },
];
