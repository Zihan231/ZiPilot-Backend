import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { AppliedVia, JobType, Platform, Prisma, Priority, Workplace } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { Response } from 'express';
import { DateTime } from 'luxon';
import { ActivityService } from '../activity/activity.module';
import { ApplicationsModule } from '../applications/applications.module';
import { ApplicationsService } from '../applications/applications.service';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CsvColumn, pickColumns, toCsv } from '../common/csv';
import { deadlineBucket, rangeToPrisma, resolveRange, startOfToday } from '../common/dates';
import { enumList, list, num, pagination, RawQuery, str } from '../common/query';
import { PrismaService } from '../prisma/prisma.module';

const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class CreateWishlistDto {
  @IsString() @MinLength(1) @MaxLength(200) company: string;
  @IsString() @MinLength(1) @MaxLength(200) position: string;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(2000) jobUrl?: string | null;
  @IsOptional() @IsEnum(Platform) platform?: Platform;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(100) country?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsEnum(Workplace) workplace?: Workplace;
  @IsOptional() @IsEnum(JobType) jobType?: JobType;
  @IsOptional() @emptyToNull() @IsInt() @Min(0) salaryMin?: number | null;
  @IsOptional() @emptyToNull() @IsInt() @Min(0) salaryMax?: number | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(10) currency?: string | null;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @emptyToNull() @IsDateString() deadline?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(20000) notes?: string | null;
  @IsOptional() @IsBoolean() reminderSent?: boolean;
  @IsOptional() @emptyToNull() @IsDateString() reminderAt?: string | null;
}

export class UpdateWishlistDto extends PartialType(CreateWishlistDto) {}

export class ApplyWishlistDto {
  @IsOptional() @IsDateString() appliedAt?: string;
  @IsOptional() @IsEnum(AppliedVia) appliedVia?: AppliedVia;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) resumeVersion?: string | null;
}

const ci = (value: string) => ({ contains: value, mode: 'insensitive' as const });

export function buildWishlistWhere(userId: string, q: RawQuery, tz: string): Prisma.WishlistJobWhereInput {
  const and: Prisma.WishlistJobWhereInput[] = [{ userId }];
  const today = startOfToday(tz).toJSDate();

  // Lifecycle: open (default) | active | expired | applied | all
  const state = str(q, 'state') ?? 'open';
  if (state === 'open') and.push({ appliedAt: null });
  if (state === 'active') and.push({ appliedAt: null, OR: [{ deadline: null }, { deadline: { gte: today } }] });
  if (state === 'expired') and.push({ appliedAt: null, deadline: { lt: today } });
  if (state === 'applied') and.push({ appliedAt: { not: null } });

  const ids = list(q, 'ids');
  if (ids.length) and.push({ id: { in: ids } });

  const text = str(q, 'q');
  if (text) {
    and.push({
      OR: [{ company: ci(text) }, { position: ci(text) }, { location: ci(text) }, { city: ci(text) }, { country: ci(text) }, { jobUrl: ci(text) }, { notes: ci(text) }],
    });
  }
  const companies = list(q, 'company');
  if (companies.length) and.push({ OR: companies.map((c) => ({ company: { equals: c, mode: 'insensitive' as const } })) });
  const position = str(q, 'position');
  if (position) and.push({ position: ci(position) });

  const platform = enumList(q, 'platform', Platform);
  if (platform.length) and.push({ platform: { in: platform } });
  const workplace = enumList(q, 'workplace', Workplace);
  if (workplace.length) and.push({ workplace: { in: workplace } });
  const jobType = enumList(q, 'jobType', JobType);
  if (jobType.length) and.push({ jobType: { in: jobType } });
  const priority = enumList(q, 'priority', Priority);
  if (priority.length) and.push({ priority: { in: priority } });

  const countries = list(q, 'country');
  if (countries.length) and.push({ OR: countries.map((c) => ({ country: { equals: c, mode: 'insensitive' as const } })) });
  const cities = list(q, 'city');
  if (cities.length) and.push({ OR: cities.map((c) => ({ city: { equals: c, mode: 'insensitive' as const } })) });
  const location = str(q, 'location');
  if (location) and.push({ OR: [{ location: ci(location) }, { city: ci(location) }, { country: ci(location) }] });

  const salaryMin = num(q, 'salaryMin');
  const salaryMax = num(q, 'salaryMax');
  if (salaryMin !== undefined) and.push({ OR: [{ salaryMax: { gte: salaryMin } }, { salaryMax: null, salaryMin: { gte: salaryMin } }] });
  if (salaryMax !== undefined) and.push({ salaryMin: { lte: salaryMax } });
  const currency = list(q, 'currency').map((c) => c.toUpperCase());
  if (currency.length) and.push({ currency: { in: currency } });

  // Deadline urgency buckets (OR within): today, tomorrow, 3d, 7d, 30d, later, expired, none, custom
  const buckets = list(q, 'deadline');
  if (buckets.length) {
    const or: Prisma.WishlistJobWhereInput[] = buckets
      .map((b) => deadlineBucket(b, tz, str(q, 'deadlineFrom'), str(q, 'deadlineTo')))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ deadline: rangeToPrisma(r) }));
    if (buckets.includes('none')) or.push({ deadline: null });
    if (or.length) and.push({ OR: or });
  }
  if (str(q, 'missingDeadline') === 'yes') and.push({ deadline: null });

  const saved = rangeToPrisma(resolveRange(str(q, 'saved'), str(q, 'savedFrom'), str(q, 'savedTo'), tz));
  if (saved) and.push({ createdAt: saved });

  const reminder = str(q, 'reminder');
  if (reminder === 'sent') and.push({ reminderSent: true });
  if (reminder === 'pending') and.push({ reminderSent: false });

  return { AND: and };
}

const SORTABLE = new Set(['deadline', 'createdAt', 'company', 'position', 'priority', 'salaryMax']);

export function buildWishlistOrder(q: RawQuery): Prisma.WishlistJobOrderByWithRelationInput[] {
  const state = str(q, 'state');
  const sort = str(q, 'sort') ?? 'deadline';
  const field = SORTABLE.has(sort) ? sort : 'deadline';
  // Expired jobs default to most-recently-expired first; everything else to nearest deadline first.
  const defaultDir = field === 'deadline' && state !== 'expired' ? 'asc' : 'desc';
  const dir: Prisma.SortOrder = (str(q, 'dir') as Prisma.SortOrder) ?? defaultDir;
  const primary = ['deadline', 'salaryMax'].includes(field) ? { [field]: { sort: dir, nulls: 'last' } } : { [field]: dir };
  return [primary as Prisma.WishlistJobOrderByWithRelationInput, { createdAt: 'desc' }];
}

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly apps: ApplicationsService,
  ) {}

  async list(user: AuthUser, q: RawQuery) {
    const where = buildWishlistWhere(user.id, q, user.tz);
    const { page, pageSize, skip, take } = pagination(q);
    const [items, total] = await Promise.all([
      this.prisma.wishlistJob.findMany({ where, orderBy: buildWishlistOrder(q), skip, take, include: { application: { select: { id: true, status: true } } } }),
      this.prisma.wishlistJob.count({ where }),
    ]);
    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async facets(user: AuthUser) {
    const base = { userId: user.id };
    const [companies, countries, cities, currencies] = await Promise.all([
      this.prisma.wishlistJob.groupBy({ by: ['company'], where: base, _count: { _all: true }, orderBy: { company: 'asc' } }),
      this.prisma.wishlistJob.groupBy({ by: ['country'], where: { ...base, country: { not: null } }, orderBy: { country: 'asc' } }),
      this.prisma.wishlistJob.groupBy({ by: ['city'], where: { ...base, city: { not: null } }, orderBy: { city: 'asc' } }),
      this.prisma.wishlistJob.groupBy({ by: ['currency'], where: { ...base, currency: { not: null } }, orderBy: { currency: 'asc' } }),
    ]);
    return {
      companies: companies.map((c) => ({ value: c.company, count: c._count._all })),
      countries: countries.map((c) => c.country!),
      cities: cities.map((c) => c.city!),
      currencies: currencies.map((c) => c.currency!),
    };
  }

  async get(user: AuthUser, id: string) {
    const job = await this.prisma.wishlistJob.findFirst({
      where: { id, userId: user.id },
      include: { application: { select: { id: true, status: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!job) throw new NotFoundException('Wishlist job not found');
    return job;
  }

  private toData(dto: Partial<CreateWishlistDto>) {
    const { deadline, reminderAt, ...rest } = dto;
    const data: Prisma.WishlistJobUncheckedUpdateInput = { ...rest };
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
    if (reminderAt !== undefined) data.reminderAt = reminderAt ? new Date(reminderAt) : null;
    if (data.currency) data.currency = String(data.currency).toUpperCase();
    return data;
  }

  async create(user: AuthUser, dto: CreateWishlistDto) {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.wishlistJob.create({ data: { ...(this.toData(dto) as Prisma.WishlistJobUncheckedCreateInput), userId: user.id } });
      await this.activity.log(user.id, { type: 'WISHLIST_ADDED', wishlistJobId: job.id, message: `Saved ${job.position} at ${job.company} to wishlist` }, tx);
      return job;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateWishlistDto) {
    await this.get(user, id);
    return this.prisma.wishlistJob.update({ where: { id }, data: this.toData(dto) });
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.wishlistJob.delete({ where: { id } });
    return { ok: true };
  }

  /** Converts a wishlist job into an application (Mark Applied). */
  async apply(user: AuthUser, id: string, dto: ApplyWishlistDto) {
    const job = await this.get(user, id);
    if (job.application) return job.application;
    const appliedAt = dto.appliedAt ?? new Date().toISOString();
    const app = await this.apps.create(
      user,
      {
        company: job.company,
        position: job.position,
        jobUrl: job.jobUrl,
        platform: job.platform,
        appliedVia: dto.appliedVia,
        jobType: job.jobType,
        workplace: job.workplace,
        location: job.location,
        country: job.country,
        city: job.city,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: job.currency,
        priority: job.priority,
        notes: job.notes,
        resumeVersion: dto.resumeVersion ?? null,
        appliedAt,
      },
      { wishlistJobId: job.id },
    );
    await this.prisma.wishlistJob.update({ where: { id }, data: { appliedAt: new Date(appliedAt) } });
    await this.activity.log(user.id, {
      type: 'WISHLIST_APPLIED',
      wishlistJobId: job.id,
      applicationId: app.id,
      message: `Applied from wishlist: ${job.position} at ${job.company}`,
    });
    return app;
  }

  async exportCsv(user: AuthUser, q: RawQuery) {
    const rows = await this.prisma.wishlistJob.findMany({ where: buildWishlistWhere(user.id, q, user.tz), orderBy: buildWishlistOrder(q) });
    return toCsv(rows, pickColumns(WISHLIST_CSV_COLUMNS, list(q, 'columns')), user.tz);
  }
}

type Job = Prisma.WishlistJobGetPayload<object>;
const WISHLIST_CSV_COLUMNS: CsvColumn<Job>[] = [
  { key: 'company', header: 'Company', value: (r) => r.company },
  { key: 'position', header: 'Position', value: (r) => r.position },
  { key: 'deadline', header: 'Deadline', value: (r) => r.deadline },
  { key: 'priority', header: 'Priority', value: (r) => r.priority },
  { key: 'platform', header: 'Platform', value: (r) => r.platform },
  { key: 'workplace', header: 'Workplace', value: (r) => r.workplace },
  { key: 'jobType', header: 'Job Type', value: (r) => r.jobType },
  { key: 'location', header: 'Location', value: (r) => [r.location, r.city, r.country].filter(Boolean).join(', ') },
  { key: 'salary', header: 'Salary', value: (r) => (r.salaryMin || r.salaryMax ? `${r.salaryMin ?? ''}-${r.salaryMax ?? ''} ${r.currency ?? ''}`.trim() : '') },
  { key: 'reminderSent', header: 'Reminder Sent', value: (r) => r.reminderSent },
  { key: 'createdAt', header: 'Saved On', value: (r) => r.createdAt },
  { key: 'appliedAt', header: 'Applied On', value: (r) => r.appliedAt },
  { key: 'jobUrl', header: 'Job URL', value: (r) => r.jobUrl },
  { key: 'notes', header: 'Notes', value: (r) => r.notes },
];

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: RawQuery) {
    return this.wishlist.list(user, q);
  }

  @Get('facets')
  facets(@CurrentUser() user: AuthUser) {
    return this.wishlist.facets(user);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() q: RawQuery, @Res() res: Response) {
    const csv = await this.wishlist.exportCsv(user, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zipilot-wishlist-${DateTime.now().toFormat('yyyy-MM-dd')}.csv"`);
    res.send(csv);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wishlist.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWishlistDto) {
    return this.wishlist.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWishlistDto) {
    return this.wishlist.update(user, id, dto);
  }

  @Post(':id/apply')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApplyWishlistDto) {
    return this.wishlist.apply(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wishlist.remove(user, id);
  }
}

@Module({ imports: [ApplicationsModule], controllers: [WishlistController], providers: [WishlistService] })
export class WishlistModule {}
