import { ApplicationStatus, Prisma } from '@prisma/client';

export const ACTIVE_STATUSES: ApplicationStatus[] = ['APPLIED', 'SCREENING', 'IN_REVIEW', 'ASSESSMENT', 'INTERVIEW', 'OFFER'];
export const SCREENING_STATUSES: ApplicationStatus[] = ['SCREENING', 'IN_REVIEW'];
export const OFFER_STATUSES: ApplicationStatus[] = ['OFFER', 'ACCEPTED'];

const RANK: Record<ApplicationStatus, number> = {
  APPLIED: 0,
  SCREENING: 1,
  IN_REVIEW: 1,
  ASSESSMENT: 2,
  INTERVIEW: 3,
  OFFER: 4,
  ACCEPTED: 4,
  REJECTED: -1,
  WITHDRAWN: -1,
  GHOSTED: -1,
};

type Milestones = {
  respondedAt?: Date | null;
  screenedAt?: Date | null;
  interviewedAt?: Date | null;
  offeredAt?: Date | null;
  rejectedAt?: Date | null;
};

/**
 * Returns milestone timestamps to set when an application moves into `status`.
 * Each milestone records the first time a funnel stage was reached, so funnels stay
 * accurate even after an application is later rejected.
 */
export function milestonesFor(status: ApplicationStatus, current: Milestones, at = new Date()): Prisma.ApplicationUpdateInput {
  const rank = RANK[status];
  const data: Prisma.ApplicationUpdateInput = {};
  if ((rank >= 1 || status === 'REJECTED') && !current.respondedAt) data.respondedAt = at;
  if (rank >= 1 && !current.screenedAt) data.screenedAt = at;
  if (rank >= 3 && !current.interviewedAt) data.interviewedAt = at;
  if (rank >= 4 && !current.offeredAt) data.offeredAt = at;
  if (status === 'REJECTED' && !current.rejectedAt) data.rejectedAt = at;
  return data;
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  IN_REVIEW: 'In Review',
  ASSESSMENT: 'Assessment',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  GHOSTED: 'Ghosted',
};
