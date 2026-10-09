/**
 * Demo data for one ZiPilot account.
 *
 *   npm run seed:demo  -- you@example.com      add sample applications + wishlist jobs
 *   npm run seed:clear -- you@example.com      remove everything tagged [seed]
 *
 * Uses the compiled services (dist/), so activity history, funnel milestones and
 * lastActivityAt are produced exactly as if you had entered the data in the app.
 * Every seeded record has "[seed]" in its notes so it can be removed safely.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { DateTime } = require('luxon');
const { ActivityService } = require('../dist/activity/activity.module');
const { ApplicationsService } = require('../dist/applications/applications.service');
const { WishlistService } = require('../dist/wishlist/wishlist.module');
const { PipelineService } = require('../dist/pipeline/pipeline.module');

const TAG = '[seed]';
const TZ = process.env.REMINDER_TIMEZONE || 'Asia/Dhaka';
const [, , mode, emailArg] = process.argv;

const day = (n, hour = 0) => DateTime.now().setZone(TZ).startOf('day').plus({ days: n, hours: hour }).toUTC().toISO();

const APPLICATIONS = [
  { company: 'Stripe', position: 'Frontend Engineer', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'REMOTE', city: 'Dublin', country: 'Ireland', salaryMin: 90000, salaryMax: 120000, currency: 'USD', status: 'INTERVIEW', priority: 'HIGH', daysAgo: 18, recruiter: ['Sara Khan', 'sara.khan@stripe.com'], outreach: { connectionStatus: 'ACCEPTED', msg1Status: 'REPLIED' }, interview: { type: 'TECHNICAL', inDays: 2, hour: 15 }, followUp: -1 },
  { company: 'Shopify', position: 'React Developer', platform: 'COMPANY_WEBSITE', appliedVia: 'WEBSITE', workplace: 'REMOTE', country: 'Canada', salaryMin: 85000, salaryMax: 110000, currency: 'USD', status: 'ASSESSMENT', priority: 'HIGH', daysAgo: 12, task: { title: 'Take-home: product listing page', type: 'TAKE_HOME', inDays: 2 }, followUp: 0 },
  { company: 'Pathao', position: 'Full Stack Developer', platform: 'BDJOBS', appliedVia: 'JOB_PORTAL', workplace: 'ONSITE', city: 'Dhaka', country: 'Bangladesh', salaryMin: 120000, salaryMax: 180000, currency: 'BDT', status: 'SCREENING', priority: 'MEDIUM', daysAgo: 9, recruiter: ['Anika Rahman', 'anika@pathao.com'], outreach: { connectionStatus: 'SENT', msg1Status: 'SENT' }, followUp: 2 },
  { company: 'bKash', position: 'Software Engineer (Frontend)', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'HYBRID', city: 'Dhaka', country: 'Bangladesh', status: 'APPLIED', priority: 'HIGH', daysAgo: 4, recruiter: ['Tanvir Hasan', null], outreach: { connectionStatus: 'ACCEPTED', msg1Status: 'REPLIED' }, needsReply: true },
  { company: 'Grab', position: 'Frontend Engineer II', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'HYBRID', city: 'Singapore', country: 'Singapore', salaryMin: 70000, salaryMax: 95000, currency: 'SGD', status: 'APPLIED', priority: 'MEDIUM', daysAgo: 15, followUp: -3 },
  { company: 'Canva', position: 'Software Engineer — Web', platform: 'COMPANY_WEBSITE', appliedVia: 'WEBSITE', workplace: 'REMOTE', country: 'Australia', status: 'IN_REVIEW', priority: 'MEDIUM', daysAgo: 21 },
  { company: 'Wise', position: 'Frontend Engineer', platform: 'LINKEDIN', appliedVia: 'REFERRAL', workplace: 'HYBRID', city: 'London', country: 'United Kingdom', salaryMin: 60000, salaryMax: 80000, currency: 'GBP', status: 'OFFER', priority: 'HIGH', daysAgo: 35, recruiter: ['Tom Becker', 'tom.becker@wise.com'], outreach: { connectionStatus: 'ACCEPTED', msg1Status: 'REPLIED', msg2Status: 'REPLIED' } },
  { company: 'Vercel', position: 'Developer Experience Engineer', platform: 'WELLFOUND', appliedVia: 'WEBSITE', workplace: 'REMOTE', status: 'REJECTED', priority: 'MEDIUM', daysAgo: 40 },
  { company: 'Notion', position: 'Product Engineer', platform: 'INDEED', appliedVia: 'WEBSITE', workplace: 'ONSITE', city: 'San Francisco', country: 'USA', status: 'APPLIED', priority: 'LOW', daysAgo: 26 },
  { company: 'Brain Station 23', position: 'Senior Frontend Developer', platform: 'BDJOBS', appliedVia: 'EMAIL', workplace: 'ONSITE', city: 'Dhaka', country: 'Bangladesh', salaryMin: 150000, salaryMax: 200000, currency: 'BDT', status: 'INTERVIEW', priority: 'MEDIUM', daysAgo: 10, interview: { type: 'HR', inDays: 5, hour: 11 } },
  { company: 'Toptal', position: 'React Developer (Contract)', platform: 'COMPANY_WEBSITE', appliedVia: 'WEBSITE', workplace: 'REMOTE', jobType: 'CONTRACT', status: 'GHOSTED', priority: 'LOW', daysAgo: 55 },
  { company: 'Atlassian', position: 'Frontend Engineer', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'REMOTE', country: 'Australia', status: 'APPLIED', priority: 'MEDIUM', daysAgo: 2, followUp: 5 },
  { company: 'Cefalo', position: 'Software Engineer', platform: 'REFERRAL', appliedVia: 'REFERRAL', workplace: 'HYBRID', city: 'Dhaka', country: 'Bangladesh', status: 'SCREENING', priority: 'HIGH', daysAgo: 6, recruiter: ['Nusrat Jahan', 'nusrat@cefalo.com'], outreach: { connectionStatus: 'ACCEPTED', msg1Status: 'SEEN' } },
  { company: 'Datadog', position: 'Frontend Engineer — Dashboards', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'HYBRID', city: 'Paris', country: 'France', status: 'INTERVIEW', priority: 'HIGH', daysAgo: 14, interview: { type: 'PHONE_SCREEN', inDays: 1, hour: 18 } },
  { company: 'Optimizely', position: 'UI Engineer', platform: 'LINKEDIN', appliedVia: 'EASY_APPLY', workplace: 'REMOTE', status: 'APPLIED', priority: 'MEDIUM', daysAgo: 0 },
  { company: 'Therap BD', position: 'Software Engineer', platform: 'BDJOBS', appliedVia: 'JOB_PORTAL', workplace: 'ONSITE', city: 'Dhaka', country: 'Bangladesh', jobType: 'FULL_TIME', status: 'APPLIED', priority: 'LOW', daysAgo: 1 },
];

const WISHLIST = [
  { company: 'Figma', position: 'Frontend Engineer, Editor', platform: 'COMPANY_WEBSITE', workplace: 'REMOTE', priority: 'HIGH', deadline: 0, jobUrl: 'https://www.figma.com/careers/' },
  { company: 'Linear', position: 'Product Engineer', platform: 'WELLFOUND', workplace: 'REMOTE', priority: 'HIGH', deadline: 1, jobUrl: 'https://linear.app/careers' },
  { company: 'Airbnb', position: 'Software Engineer, Web Platform', platform: 'LINKEDIN', workplace: 'REMOTE', priority: 'MEDIUM', deadline: 3, jobUrl: 'https://careers.airbnb.com/' },
  { company: 'Supabase', position: 'Frontend Engineer', platform: 'COMPANY_WEBSITE', workplace: 'REMOTE', priority: 'MEDIUM', deadline: 2, jobUrl: 'https://supabase.com/careers' },
  { company: 'GitLab', position: 'Frontend Engineer, Plan', platform: 'COMPANY_WEBSITE', workplace: 'REMOTE', priority: 'MEDIUM', deadline: 9, reminderAt: 0, jobUrl: 'https://about.gitlab.com/jobs/' },
  { company: 'Miro', position: 'Senior Frontend Engineer', platform: 'LINKEDIN', workplace: 'HYBRID', priority: 'LOW', deadline: 6 },
  { company: 'Duolingo', position: 'Software Engineer, Web', platform: 'LINKEDIN', workplace: 'ONSITE', priority: 'LOW', deadline: -2 },
  { company: 'Enosis Solutions', position: 'Frontend Developer', platform: 'BDJOBS', workplace: 'ONSITE', priority: 'MEDIUM', deadline: null, city: 'Dhaka', country: 'Bangladesh' },
];

async function main() {
  if (!['seed', 'clear'].includes(mode) || !emailArg) {
    console.log('Usage: node scripts/seed-demo.js <seed|clear> <account-email>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: emailArg, mode: 'insensitive' } } });
    if (!user) throw new Error(`No ZiPilot account for ${emailArg}. Sign in to the app once first.`);
    const auth = { id: user.id, uid: user.firebaseUid, email: user.email, tz: TZ };

    if (mode === 'clear') {
      const a = await prisma.application.deleteMany({ where: { userId: user.id, notes: { contains: TAG } } });
      const w = await prisma.wishlistJob.deleteMany({ where: { userId: user.id, notes: { contains: TAG } } });
      console.log(`Removed ${a.count} seeded applications and ${w.count} seeded wishlist jobs for ${user.email}.`);
      return;
    }

    const existing = await prisma.application.count({ where: { userId: user.id, notes: { contains: TAG } } });
    if (existing) throw new Error(`Demo data already exists (${existing} applications). Run "npm run seed:clear -- ${emailArg}" first.`);

    const activity = new ActivityService(prisma);
    const apps = new ApplicationsService(prisma, activity);
    const wishlist = new WishlistService(prisma, activity, apps);
    const pipeline = new PipelineService(prisma, activity);

    for (const a of APPLICATIONS) {
      const created = await apps.create(auth, {
        company: a.company,
        position: a.position,
        platform: a.platform,
        appliedVia: a.appliedVia,
        workplace: a.workplace,
        jobType: a.jobType ?? 'FULL_TIME',
        city: a.city ?? null,
        country: a.country ?? null,
        salaryMin: a.salaryMin ?? null,
        salaryMax: a.salaryMax ?? null,
        currency: a.currency ?? null,
        priority: a.priority,
        appliedAt: day(-a.daysAgo, 10),
        jobUrl: `https://jobs.example.com/${a.company.toLowerCase().replace(/\s+/g, '-')}`,
        resumeVersion: a.workplace === 'REMOTE' ? 'v4-remote' : 'v3-frontend',
        recruiterName: a.recruiter?.[0] ?? null,
        recruiterEmail: a.recruiter?.[1] ?? null,
        recruiterLinkedin: a.recruiter ? 'https://www.linkedin.com/in/example' : null,
        notes: `${TAG} Demo application.`,
      });
      if (a.status !== 'APPLIED') await apps.update(auth, created.id, { status: a.status });
      if (a.outreach) await apps.update(auth, created.id, a.outreach);
      if (a.needsReply) await apps.update(auth, created.id, { needsReply: true });
      if (a.interview) await pipeline.createInterview(auth, created.id, { type: a.interview.type, scheduledAt: day(a.interview.inDays, a.interview.hour), durationMinutes: 45, location: 'https://meet.google.com/abc-defg-hij' });
      if (a.task) await pipeline.createTask(auth, created.id, { title: a.task.title, type: a.task.type, dueAt: day(a.task.inDays, 23) });
      if (a.followUp !== undefined) await pipeline.createFollowUp(auth, created.id, { dueAt: day(a.followUp), channel: 'LINKEDIN', note: 'Check in on application status' });
    }

    for (const w of WISHLIST) {
      await wishlist.create(auth, {
        company: w.company,
        position: w.position,
        platform: w.platform,
        workplace: w.workplace,
        jobType: 'FULL_TIME',
        priority: w.priority,
        deadline: w.deadline === null ? null : day(w.deadline),
        reminderAt: w.reminderAt === undefined ? null : day(w.reminderAt),
        jobUrl: w.jobUrl ?? null,
        city: w.city ?? null,
        country: w.country ?? null,
        notes: `${TAG} Demo wishlist job.`,
      });
    }
    console.log(`Seeded ${APPLICATIONS.length} applications and ${WISHLIST.length} wishlist jobs for ${user.email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
