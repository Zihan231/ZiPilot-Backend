import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RawQuery, str } from '../common/query';
import { PrismaService } from '../prisma/prisma.module';

const ci = (value: string) => ({ contains: value, mode: 'insensitive' as const });

type Field = { key: string; label: string };
const APP_FIELDS: Field[] = [
  { key: 'company', label: 'Company' },
  { key: 'position', label: 'Position' },
  { key: 'jobUrl', label: 'Job URL' },
  { key: 'location', label: 'Location' },
  { key: 'city', label: 'Location' },
  { key: 'country', label: 'Location' },
  { key: 'recruiterName', label: 'Recruiter' },
  { key: 'recruiterEmail', label: 'Recruiter email' },
  { key: 'notes', label: 'Notes' },
];
const WISH_FIELDS = APP_FIELDS.filter((f) => !f.key.startsWith('recruiter'));

function matchedField(row: Record<string, unknown>, fields: Field[], q: string) {
  const needle = q.toLowerCase();
  for (const f of fields) {
    const v = row[f.key];
    if (typeof v === 'string' && v.toLowerCase().includes(needle)) {
      const i = v.toLowerCase().indexOf(needle);
      const snippet = v.length > 80 ? `${i > 20 ? '…' : ''}${v.slice(Math.max(0, i - 20), i + needle.length + 40)}…` : v;
      return { field: f.label, snippet };
    }
  }
  return null;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grouped global search. ILIKE '%q%' queries are served by pg_trgm GIN indexes. */
  async search(user: AuthUser, raw: RawQuery) {
    const q = (str(raw, 'q') ?? '').trim();
    const limit = Math.min(20, Number(str(raw, 'limit') ?? 8));
    if (q.length < 2) return { query: q, applications: [], wishlist: [], totals: { applications: 0, wishlist: 0 } };

    const appWhere: Prisma.ApplicationWhereInput = { userId: user.id, OR: APP_FIELDS.map((f) => ({ [f.key]: ci(q) })) };
    const wishWhere: Prisma.WishlistJobWhereInput = { userId: user.id, OR: WISH_FIELDS.map((f) => ({ [f.key]: ci(q) })) };

    const [apps, appTotal, wish, wishTotal] = await this.prisma.$transaction([
      this.prisma.application.findMany({ where: appWhere, orderBy: { lastActivityAt: 'desc' }, take: limit }),
      this.prisma.application.count({ where: appWhere }),
      this.prisma.wishlistJob.findMany({ where: wishWhere, orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.wishlistJob.count({ where: wishWhere }),
    ]);

    return {
      query: q,
      totals: { applications: appTotal, wishlist: wishTotal },
      applications: apps.map((a) => ({
        id: a.id,
        company: a.company,
        position: a.position,
        status: a.status,
        appliedAt: a.appliedAt,
        recruiterName: a.recruiterName,
        match: matchedField(a, APP_FIELDS, q),
      })),
      wishlist: wish.map((w) => ({
        id: w.id,
        company: w.company,
        position: w.position,
        deadline: w.deadline,
        appliedAt: w.appliedAt,
        match: matchedField(w, WISH_FIELDS, q),
      })),
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}
  @Get() search(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.search(u, q); }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
