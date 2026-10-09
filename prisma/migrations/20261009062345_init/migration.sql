-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'IN_REVIEW', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'GHOSTED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('LINKEDIN', 'INDEED', 'GLASSDOOR', 'COMPANY_WEBSITE', 'WELLFOUND', 'BDJOBS', 'ZIPRECRUITER', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AppliedVia" AS ENUM ('EASY_APPLY', 'WEBSITE', 'EMAIL', 'REFERRAL', 'RECRUITER', 'JOB_PORTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "Workplace" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_SENT', 'SENT', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('NOT_SENT', 'SENT', 'SEEN', 'REPLIED');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE_SCREEN', 'HR', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'ONSITE', 'FINAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CODING_ASSESSMENT', 'TAKE_HOME', 'PRESENTATION', 'QUESTIONNAIRE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'SUBMITTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FollowUpChannel" AS ENUM ('EMAIL', 'LINKEDIN', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('APPLICATION_CREATED', 'APPLICATION_UPDATED', 'STATUS_CHANGED', 'WISHLIST_ADDED', 'WISHLIST_APPLIED', 'RECRUITER_MESSAGE', 'RECRUITER_REPLY', 'INTERVIEW_SCHEDULED', 'INTERVIEW_UPDATED', 'FOLLOWUP_SCHEDULED', 'FOLLOWUP_COMPLETED', 'TASK_ADDED', 'TASK_SUBMITTED', 'TASK_COMPLETED');

-- CreateEnum
CREATE TYPE "PresetScope" AS ENUM ('APPLICATIONS', 'WISHLIST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "photoUrl" TEXT,
    "dashboardLayout" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "jobUrl" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'LINKEDIN',
    "appliedVia" "AppliedVia" NOT NULL DEFAULT 'WEBSITE',
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "workplace" "Workplace" NOT NULL DEFAULT 'ONSITE',
    "location" TEXT,
    "country" TEXT,
    "city" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "resumeVersion" TEXT,
    "notes" TEXT,
    "recruiterName" TEXT,
    "recruiterEmail" TEXT,
    "recruiterLinkedin" TEXT,
    "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'NOT_SENT',
    "msg1Status" "MessageStatus" NOT NULL DEFAULT 'NOT_SENT',
    "msg1SentAt" TIMESTAMP(3),
    "msg2Status" "MessageStatus" NOT NULL DEFAULT 'NOT_SENT',
    "msg2SentAt" TIMESTAMP(3),
    "msg3Status" "MessageStatus" NOT NULL DEFAULT 'NOT_SENT',
    "msg3SentAt" TIMESTAMP(3),
    "recruiterReplied" BOOLEAN NOT NULL DEFAULT false,
    "recruiterRepliedAt" TIMESTAMP(3),
    "needsReply" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMP(3),
    "screenedAt" TIMESTAMP(3),
    "interviewedAt" TIMESTAMP(3),
    "offeredAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wishlistJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "jobUrl" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'LINKEDIN',
    "location" TEXT,
    "country" TEXT,
    "city" TEXT,
    "workplace" "Workplace" NOT NULL DEFAULT 'ONSITE',
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "notes" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "channel" "FollowUpChannel" NOT NULL DEFAULT 'EMAIL',
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'PHONE_SCREEN',
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "location" TEXT,
    "interviewer" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TaskType" NOT NULL DEFAULT 'CODING_ASSESSMENT',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "link" TEXT,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "wishlistJobId" TEXT,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "PresetScope" NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilterPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Application_wishlistJobId_key" ON "Application"("wishlistJobId");

-- CreateIndex
CREATE INDEX "Application_userId_appliedAt_idx" ON "Application"("userId", "appliedAt");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_userId_lastActivityAt_idx" ON "Application"("userId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Application_userId_platform_idx" ON "Application"("userId", "platform");

-- CreateIndex
CREATE INDEX "Application_userId_deadline_idx" ON "Application"("userId", "deadline");

-- CreateIndex
CREATE INDEX "Application_userId_company_idx" ON "Application"("userId", "company");

-- CreateIndex
CREATE INDEX "Application_userId_needsReply_idx" ON "Application"("userId", "needsReply");

-- CreateIndex
CREATE INDEX "Application_company_trgm" ON "Application" USING GIN ("company" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_position_trgm" ON "Application" USING GIN ("position" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_location_trgm" ON "Application" USING GIN ("location" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_recruiterName_trgm" ON "Application" USING GIN ("recruiterName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_recruiterEmail_trgm" ON "Application" USING GIN ("recruiterEmail" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_notes_trgm" ON "Application" USING GIN ("notes" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Application_jobUrl_trgm" ON "Application" USING GIN ("jobUrl" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WishlistJob_userId_deadline_idx" ON "WishlistJob"("userId", "deadline");

-- CreateIndex
CREATE INDEX "WishlistJob_userId_appliedAt_idx" ON "WishlistJob"("userId", "appliedAt");

-- CreateIndex
CREATE INDEX "WishlistJob_userId_createdAt_idx" ON "WishlistJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WishlistJob_company_trgm" ON "WishlistJob" USING GIN ("company" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WishlistJob_position_trgm" ON "WishlistJob" USING GIN ("position" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WishlistJob_location_trgm" ON "WishlistJob" USING GIN ("location" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "WishlistJob_notes_trgm" ON "WishlistJob" USING GIN ("notes" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "FollowUp_userId_completedAt_dueAt_idx" ON "FollowUp"("userId", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUp_applicationId_idx" ON "FollowUp"("applicationId");

-- CreateIndex
CREATE INDEX "Interview_userId_status_scheduledAt_idx" ON "Interview"("userId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Interview_applicationId_idx" ON "Interview"("applicationId");

-- CreateIndex
CREATE INDEX "Task_userId_status_dueAt_idx" ON "Task"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_applicationId_idx" ON "Task"("applicationId");

-- CreateIndex
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_userId_type_createdAt_idx" ON "Activity"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_applicationId_idx" ON "Activity"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "FilterPreset_userId_scope_name_key" ON "FilterPreset"("userId", "scope", "name");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_wishlistJobId_fkey" FOREIGN KEY ("wishlistJobId") REFERENCES "WishlistJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistJob" ADD CONSTRAINT "WishlistJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_wishlistJobId_fkey" FOREIGN KEY ("wishlistJobId") REFERENCES "WishlistJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterPreset" ADD CONSTRAINT "FilterPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
