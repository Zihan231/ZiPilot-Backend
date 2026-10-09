import {
  AppliedVia,
  ApplicationStatus,
  ConnectionStatus,
  InterviewStatus,
  JobType,
  MessageStatus,
  Platform,
  Prisma,
  Priority,
  TaskStatus,
  Workplace,
} from '@prisma/client';
import { daysAgo, deadlineBucket, rangeToPrisma, resolveRange, startOfToday } from '../common/dates';
import { enumList, list, num, RawQuery, str } from '../common/query';

const ci = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * Builds the Prisma `where` for applications from URL-style query params.
 * - Different filters are combined with AND.
 * - Multiple values inside one filter are combined with OR.
 * This single builder powers the list, exports, dashboard cards and analytics drill-downs,
 * so every number in the app agrees with the filtered list it links to.
 */
export function buildApplicationWhere(userId: string, q: RawQuery, tz: string): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [{ userId }];

  // Free text search
  const text = str(q, 'q');
  if (text) {
    and.push({
      OR: [
        { company: ci(text) },
        { position: ci(text) },
        { location: ci(text) },
        { city: ci(text) },
        { country: ci(text) },
        { jobUrl: ci(text) },
        { recruiterName: ci(text) },
        { recruiterEmail: ci(text) },
        { notes: ci(text) },
      ],
    });
  }

  const ids = list(q, 'ids');
  if (ids.length) and.push({ id: { in: ids } });

  // Application date
  const appliedAt = rangeToPrisma(resolveRange(str(q, 'applied'), str(q, 'appliedFrom'), str(q, 'appliedTo'), tz));
  if (appliedAt) and.push({ appliedAt });

  const status = enumList(q, 'status', ApplicationStatus);
  if (status.length) and.push({ status: { in: status } });

  const companies = list(q, 'company');
  if (companies.length) and.push({ OR: companies.map((c) => ({ company: { equals: c, mode: 'insensitive' as const } })) });

  const position = str(q, 'position');
  if (position) and.push({ position: ci(position) });

  const platform = enumList(q, 'platform', Platform);
  if (platform.length) and.push({ platform: { in: platform } });
  const appliedVia = enumList(q, 'appliedVia', AppliedVia);
  if (appliedVia.length) and.push({ appliedVia: { in: appliedVia } });
  const jobType = enumList(q, 'jobType', JobType);
  if (jobType.length) and.push({ jobType: { in: jobType } });
  const workplace = enumList(q, 'workplace', Workplace);
  if (workplace.length) and.push({ workplace: { in: workplace } });
  const priority = enumList(q, 'priority', Priority);
  if (priority.length) and.push({ priority: { in: priority } });

  // Location
  const countries = list(q, 'country');
  if (countries.length) and.push({ OR: countries.map((c) => ({ country: { equals: c, mode: 'insensitive' as const } })) });
  const cities = list(q, 'city');
  if (cities.length) and.push({ OR: cities.map((c) => ({ city: { equals: c, mode: 'insensitive' as const } })) });
  const location = str(q, 'location');
  if (location) and.push({ OR: [{ location: ci(location) }, { city: ci(location) }, { country: ci(location) }] });

  // Salary (range overlap)
  const salaryMin = num(q, 'salaryMin');
  const salaryMax = num(q, 'salaryMax');
  if (salaryMin !== undefined) and.push({ OR: [{ salaryMax: { gte: salaryMin } }, { salaryMax: null, salaryMin: { gte: salaryMin } }] });
  if (salaryMax !== undefined) and.push({ salaryMin: { lte: salaryMax } });
  const currency = list(q, 'currency').map((c) => c.toUpperCase());
  if (currency.length) and.push({ currency: { in: currency } });

  // Deadline buckets (OR within)
  const deadlines = list(q, 'deadline')
    .map((b) => deadlineBucket(b, tz, str(q, 'deadlineFrom'), str(q, 'deadlineTo')))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ deadline: rangeToPrisma(r) }));
  if (list(q, 'deadline').includes('none')) deadlines.push({ deadline: null as never });
  if (deadlines.length) and.push({ OR: deadlines });

  // Recruiter
  const connection = enumList(q, 'connection', ConnectionStatus);
  if (connection.length) and.push({ connectionStatus: { in: connection } });
  for (const n of [1, 2, 3] as const) {
    const s = enumList(q, `msg${n}`, MessageStatus);
    if (s.length) and.push({ [`msg${n}Status`]: { in: s } });
  }
  const replied = str(q, 'replied');
  if (replied === 'yes') and.push({ recruiterReplied: true });
  if (replied === 'no') and.push({ recruiterReplied: false });
  if (str(q, 'needsReply') === 'yes') and.push({ needsReply: true });

  // Follow-ups
  const followUp = list(q, 'followUp');
  if (followUp.length) {
    const today = startOfToday(tz);
    const tomorrow = today.plus({ days: 1 }).toJSDate();
    const or: Prisma.ApplicationWhereInput[] = [];
    if (followUp.includes('overdue')) or.push({ followUps: { some: { completedAt: null, dueAt: { lt: today.toJSDate() } } } });
    if (followUp.includes('today')) or.push({ followUps: { some: { completedAt: null, dueAt: { gte: today.toJSDate(), lt: tomorrow } } } });
    if (followUp.includes('upcoming')) or.push({ followUps: { some: { completedAt: null, dueAt: { gte: tomorrow } } } });
    if (followUp.includes('pending')) or.push({ followUps: { some: { completedAt: null } } });
    if (followUp.includes('none')) or.push({ followUps: { none: { completedAt: null } } });
    if (or.length) and.push({ OR: or });
  }

  // Tasks
  const task = enumList(q, 'task', TaskStatus);
  if (task.length) and.push({ tasks: { some: { status: { in: task } } } });

  // Interviews
  const interview = list(q, 'interview');
  if (interview.length) {
    const or: Prisma.ApplicationWhereInput[] = [];
    for (const s of interview) {
      if (s === 'NONE') or.push({ interviews: { none: {} } });
      else if (s === 'UPCOMING') or.push({ interviews: { some: { status: 'SCHEDULED', scheduledAt: { gte: new Date() } } } });
      else if ((Object.values(InterviewStatus) as string[]).includes(s)) or.push({ interviews: { some: { status: s as InterviewStatus } } });
    }
    if (or.length) and.push({ OR: or });
  }

  const resume = list(q, 'resume');
  if (resume.length) and.push({ OR: resume.map((r) => ({ resumeVersion: { equals: r, mode: 'insensitive' as const } })) });
  const resumeText = str(q, 'resumeText');
  if (resumeText) and.push({ resumeVersion: ci(resumeText) });

  // Inactivity — no activity for N days
  const inactive = num(q, 'inactive');
  if (inactive) and.push({ lastActivityAt: { lt: daysAgo(inactive) } });
  if (str(q, 'activeOnly') === 'yes') and.push({ status: { in: ['APPLIED', 'SCREENING', 'IN_REVIEW', 'ASSESSMENT', 'INTERVIEW', 'OFFER'] } });

  // Funnel stage reached (for analytics drill-down)
  const reached = list(q, 'reached');
  const reachedField: Record<string, keyof Prisma.ApplicationWhereInput> = {
    responded: 'respondedAt',
    screened: 'screenedAt',
    interviewed: 'interviewedAt',
    offered: 'offeredAt',
  };
  for (const r of reached) if (reachedField[r]) and.push({ [reachedField[r]]: { not: null } });

  // Recruiter contacted (any outreach)
  if (str(q, 'contacted') === 'yes') {
    and.push({ OR: [{ connectionStatus: { not: 'NOT_SENT' } }, { msg1Status: { not: 'NOT_SENT' } }] });
  }

  // Missing data (OR within)
  const missing = list(q, 'missing');
  if (missing.length) {
    const map: Record<string, Prisma.ApplicationWhereInput> = {
      recruiter: { recruiterName: null },
      email: { recruiterEmail: null },
      linkedin: { recruiterLinkedin: null },
      salary: { salaryMin: null, salaryMax: null },
      deadline: { deadline: null },
      jobUrl: { jobUrl: null },
      location: { location: null, city: null, country: null },
      resume: { resumeVersion: null },
    };
    const or = missing.map((m) => map[m]).filter(Boolean);
    if (or.length) and.push({ OR: or });
  }

  return { AND: and };
}

const SORTABLE = new Set([
  'appliedAt',
  'company',
  'position',
  'status',
  'priority',
  'deadline',
  'lastActivityAt',
  'createdAt',
  'salaryMax',
  'platform',
  'workplace',
  'jobType',
]);

export function buildApplicationOrder(q: RawQuery): Prisma.ApplicationOrderByWithRelationInput[] {
  const sort = str(q, 'sort') ?? 'appliedAt';
  const dir: Prisma.SortOrder = str(q, 'dir') === 'asc' ? 'asc' : 'desc';
  const field = SORTABLE.has(sort) ? sort : 'appliedAt';
  const nullable = ['deadline', 'salaryMax'].includes(field);
  const primary = nullable ? { [field]: { sort: dir, nulls: 'last' } } : { [field]: dir };
  return [primary as Prisma.ApplicationOrderByWithRelationInput, { createdAt: 'desc' }];
}
