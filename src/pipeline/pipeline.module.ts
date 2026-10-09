import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { FollowUpChannel, InterviewStatus, InterviewType, Prisma, TaskStatus, TaskType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DateTime } from 'luxon';
import { ActivityService, LogInput } from '../activity/activity.module';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { safeZone, startOfToday } from '../common/dates';
import { enumList, list, pagination, RawQuery } from '../common/query';
import { milestonesFor } from '../common/status';
import { PrismaService } from '../prisma/prisma.module';

const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

// ── DTOs ──
export class CreateFollowUpDto {
  @IsDateString() dueAt: string;
  @IsOptional() @IsEnum(FollowUpChannel) channel?: FollowUpChannel;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(2000) note?: string | null;
}
export class UpdateFollowUpDto extends PartialType(CreateFollowUpDto) {}
export class CompleteFollowUpDto {
  /** Optionally schedule the next follow-up when completing this one. */
  @IsOptional() @IsDateString() nextDueAt?: string;
}

export class CreateInterviewDto {
  @IsOptional() @IsEnum(InterviewType) type?: InterviewType;
  @IsOptional() @IsEnum(InterviewStatus) status?: InterviewStatus;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(500) location?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) interviewer?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(5000) notes?: string | null;
}
export class UpdateInterviewDto extends PartialType(CreateInterviewDto) {}

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsEnum(TaskType) type?: TaskType;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @emptyToNull() @IsDateString() dueAt?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(2000) link?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(5000) notes?: string | null;
}
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

const APP_SELECT = { id: true, company: true, position: true, status: true, jobUrl: true, recruiterName: true, recruiterLinkedin: true, recruiterEmail: true } as const;
const fmtDay = (d: Date, tz: string) => DateTime.fromJSDate(d).setZone(safeZone(tz)).toFormat('LLL d');

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private async app(user: AuthUser, applicationId: string) {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, userId: user.id } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  // ── Follow-ups ──
  async listFollowUps(user: AuthUser, q: RawQuery) {
    const { page, pageSize, skip, take } = pagination(q, 50);
    const today = startOfToday(user.tz);
    const buckets = list(q, 'when');
    const where: Prisma.FollowUpWhereInput = { userId: user.id };
    if (list(q, 'state').includes('done')) where.completedAt = { not: null };
    else where.completedAt = null;
    const or: Prisma.FollowUpWhereInput[] = [];
    if (buckets.includes('overdue')) or.push({ dueAt: { lt: today.toJSDate() } });
    if (buckets.includes('today')) or.push({ dueAt: { gte: today.toJSDate(), lt: today.plus({ days: 1 }).toJSDate() } });
    if (buckets.includes('upcoming')) or.push({ dueAt: { gte: today.plus({ days: 1 }).toJSDate() } });
    if (or.length) where.OR = or;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.followUp.findMany({ where, orderBy: { dueAt: 'asc' }, skip, take, include: { application: { select: APP_SELECT } } }),
      this.prisma.followUp.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createFollowUp(user: AuthUser, applicationId: string, dto: CreateFollowUpDto) {
    const app = await this.app(user, applicationId);
    return this.prisma.$transaction(async (tx) => {
      const f = await tx.followUp.create({
        data: { userId: user.id, applicationId, dueAt: new Date(dto.dueAt), channel: dto.channel, note: dto.note ?? null },
      });
      await this.activity.log(
        user.id,
        { type: 'FOLLOWUP_SCHEDULED', applicationId, message: `Follow-up scheduled for ${fmtDay(f.dueAt, user.tz)} — ${app.company}` },
        tx,
      );
      return f;
    });
  }

  private async ownFollowUp(user: AuthUser, id: string) {
    const f = await this.prisma.followUp.findFirst({ where: { id, userId: user.id }, include: { application: true } });
    if (!f) throw new NotFoundException('Follow-up not found');
    return f;
  }

  async updateFollowUp(user: AuthUser, id: string, dto: UpdateFollowUpDto) {
    const f = await this.ownFollowUp(user, id);
    const data: Prisma.FollowUpUpdateInput = { channel: dto.channel, note: dto.note };
    if (dto.dueAt) data.dueAt = new Date(dto.dueAt);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({ where: { id }, data });
      if (dto.dueAt) {
        await this.activity.log(
          user.id,
          { type: 'FOLLOWUP_SCHEDULED', applicationId: f.applicationId, message: `Follow-up rescheduled to ${fmtDay(updated.dueAt, user.tz)} — ${f.application.company}` },
          tx,
        );
      }
      return updated;
    });
  }

  async completeFollowUp(user: AuthUser, id: string, dto: CompleteFollowUpDto) {
    const f = await this.ownFollowUp(user, id);
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.followUp.update({ where: { id }, data: { completedAt: new Date() } });
      await this.activity.log(
        user.id,
        { type: 'FOLLOWUP_COMPLETED', applicationId: f.applicationId, message: `Followed up with ${f.application.recruiterName ?? f.application.company} — ${f.application.position}` },
        tx,
      );
      if (dto.nextDueAt) {
        await tx.followUp.create({ data: { userId: user.id, applicationId: f.applicationId, dueAt: new Date(dto.nextDueAt), channel: f.channel } });
      }
      return done;
    });
  }

  async reopenFollowUp(user: AuthUser, id: string) {
    await this.ownFollowUp(user, id);
    return this.prisma.followUp.update({ where: { id }, data: { completedAt: null } });
  }

  async deleteFollowUp(user: AuthUser, id: string) {
    await this.ownFollowUp(user, id);
    await this.prisma.followUp.delete({ where: { id } });
    return { ok: true };
  }

  // ── Interviews ──
  async listInterviews(user: AuthUser, q: RawQuery) {
    const { page, pageSize, skip, take } = pagination(q, 50);
    const status = enumList(q, 'status', InterviewStatus);
    const where: Prisma.InterviewWhereInput = { userId: user.id };
    if (status.length) where.status = { in: status };
    if (list(q, 'when').includes('upcoming')) where.scheduledAt = { gte: DateTime.now().minus({ hours: 2 }).toJSDate() };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.interview.findMany({ where, orderBy: { scheduledAt: 'asc' }, skip, take, include: { application: { select: APP_SELECT } } }),
      this.prisma.interview.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createInterview(user: AuthUser, applicationId: string, dto: CreateInterviewDto) {
    const app = await this.app(user, applicationId);
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.interview.create({
        data: {
          userId: user.id,
          applicationId,
          type: dto.type,
          status: dto.status,
          scheduledAt: new Date(dto.scheduledAt),
          durationMinutes: dto.durationMinutes ?? null,
          location: dto.location ?? null,
          interviewer: dto.interviewer ?? null,
          notes: dto.notes ?? null,
        },
      });
      // Scheduling an interview moves the application into the Interview stage.
      const appData: Prisma.ApplicationUpdateInput = { ...milestonesFor('INTERVIEW', app) };
      const advance = ['APPLIED', 'SCREENING', 'IN_REVIEW', 'ASSESSMENT'].includes(app.status);
      if (advance) appData.status = 'INTERVIEW';
      await tx.application.update({ where: { id: applicationId }, data: appData });
      const logs: LogInput[] = [
        {
          type: 'INTERVIEW_SCHEDULED',
          applicationId,
          message: `${i.type.replace(/_/g, ' ').toLowerCase()} interview scheduled for ${fmtDay(i.scheduledAt, user.tz)} — ${app.company}`,
          meta: { interviewId: i.id },
        },
      ];
      if (advance) {
        logs.push({ type: 'STATUS_CHANGED', applicationId, message: `${app.position} at ${app.company}: moved to Interview`, meta: { from: app.status, to: 'INTERVIEW' } });
      }
      await this.activity.log(user.id, logs, tx);
      return i;
    });
  }

  private async ownInterview(user: AuthUser, id: string) {
    const i = await this.prisma.interview.findFirst({ where: { id, userId: user.id }, include: { application: true } });
    if (!i) throw new NotFoundException('Interview not found');
    return i;
  }

  async updateInterview(user: AuthUser, id: string, dto: UpdateInterviewDto) {
    const prev = await this.ownInterview(user, id);
    const data: Prisma.InterviewUpdateInput = { ...dto, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined };
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.interview.update({ where: { id }, data });
      let message = `Interview updated — ${prev.application.company}`;
      if (dto.status && dto.status !== prev.status) message = `Interview ${dto.status.toLowerCase()} — ${prev.application.company}`;
      else if (dto.scheduledAt && +new Date(dto.scheduledAt) !== +prev.scheduledAt) message = `Interview rescheduled to ${fmtDay(i.scheduledAt, user.tz)} — ${prev.application.company}`;
      await this.activity.log(user.id, { type: 'INTERVIEW_UPDATED', applicationId: prev.applicationId, message, meta: { interviewId: id } }, tx);
      return i;
    });
  }

  async deleteInterview(user: AuthUser, id: string) {
    await this.ownInterview(user, id);
    await this.prisma.interview.delete({ where: { id } });
    return { ok: true };
  }

  // ── Tasks / assessments ──
  async listTasks(user: AuthUser, q: RawQuery) {
    const { page, pageSize, skip, take } = pagination(q, 50);
    const status = enumList(q, 'status', TaskStatus);
    const where: Prisma.TaskWhereInput = { userId: user.id };
    if (status.length) where.status = { in: status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }], skip, take, include: { application: { select: APP_SELECT } } }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createTask(user: AuthUser, applicationId: string, dto: CreateTaskDto) {
    const app = await this.app(user, applicationId);
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          userId: user.id,
          applicationId,
          title: dto.title,
          type: dto.type,
          status: dto.status,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          link: dto.link ?? null,
          notes: dto.notes ?? null,
        },
      });
      await this.activity.log(user.id, { type: 'TASK_ADDED', applicationId, message: `Task added: ${t.title} — ${app.company}` }, tx);
      return t;
    });
  }

  async updateTask(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const prev = await this.prisma.task.findFirst({ where: { id, userId: user.id }, include: { application: true } });
    if (!prev) throw new NotFoundException('Task not found');
    const data: Prisma.TaskUpdateInput = { ...dto, dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null };
    if (dto.status && dto.status !== prev.status) {
      if (dto.status === 'SUBMITTED') data.submittedAt = new Date();
      if (dto.status === 'COMPLETED') data.completedAt = new Date();
      if (dto.status === 'PENDING') Object.assign(data, { submittedAt: null, completedAt: null });
    }
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.task.update({ where: { id }, data });
      if (dto.status && dto.status !== prev.status && dto.status !== 'PENDING') {
        await this.activity.log(
          user.id,
          {
            type: dto.status === 'SUBMITTED' ? 'TASK_SUBMITTED' : 'TASK_COMPLETED',
            applicationId: prev.applicationId,
            message: `${t.title} ${dto.status.toLowerCase()} — ${prev.application.company}`,
          },
          tx,
        );
      }
      return t;
    });
  }

  async deleteTask(user: AuthUser, id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, userId: user.id } });
    if (!t) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller()
export class PipelineController {
  constructor(private readonly svc: PipelineService) {}

  @Get('follow-ups') listFollowUps(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.listFollowUps(u, q); }
  @Post('applications/:id/follow-ups') createFollowUp(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateFollowUpDto) { return this.svc.createFollowUp(u, id, dto); }
  @Patch('follow-ups/:id') updateFollowUp(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateFollowUpDto) { return this.svc.updateFollowUp(u, id, dto); }
  @Post('follow-ups/:id/complete') completeFollowUp(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CompleteFollowUpDto) { return this.svc.completeFollowUp(u, id, dto); }
  @Post('follow-ups/:id/reopen') reopenFollowUp(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.reopenFollowUp(u, id); }
  @Delete('follow-ups/:id') deleteFollowUp(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteFollowUp(u, id); }

  @Get('interviews') listInterviews(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.listInterviews(u, q); }
  @Post('applications/:id/interviews') createInterview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateInterviewDto) { return this.svc.createInterview(u, id, dto); }
  @Patch('interviews/:id') updateInterview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateInterviewDto) { return this.svc.updateInterview(u, id, dto); }
  @Delete('interviews/:id') deleteInterview(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteInterview(u, id); }

  @Get('tasks') listTasks(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.listTasks(u, q); }
  @Post('applications/:id/tasks') createTask(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateTaskDto) { return this.svc.createTask(u, id, dto); }
  @Patch('tasks/:id') updateTask(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) { return this.svc.updateTask(u, id, dto); }
  @Delete('tasks/:id') deleteTask(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.deleteTask(u, id); }
}

@Module({ controllers: [PipelineController], providers: [PipelineService] })
export class PipelineModule {}
