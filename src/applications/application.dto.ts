import {
  ApplicationStatus,
  ConnectionStatus,
  JobType,
  MessageStatus,
  Priority,
  Workplace,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const emptyToNull = () => Transform(({ value }) => (value === '' ? null : value));

export class CreateApplicationDto {
  @IsString() @MinLength(1) @MaxLength(200) company: string;
  @IsString() @MinLength(1) @MaxLength(200) position: string;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(2000) jobUrl?: string | null;
  /** Built-in key (LINKEDIN…) or custom option text */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) platform?: string;
  /** Built-in key (EASY_APPLY…) or custom option text */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) appliedVia?: string;
  @IsOptional() @IsEnum(JobType) jobType?: JobType;
  @IsOptional() @IsEnum(Workplace) workplace?: Workplace;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) location?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(100) country?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @emptyToNull() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) salaryMin?: number | null;
  @IsOptional() @emptyToNull() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) salaryMax?: number | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(10) currency?: string | null;
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() appliedAt?: string;
  @IsOptional() @emptyToNull() @ValidateIf((_, v) => v !== null) @IsDateString() deadline?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(500) companyWebsite?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(100) jobReference?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(20000) notes?: string | null;

  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) recruiterName?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(200) recruiterEmail?: string | null;
  @IsOptional() @emptyToNull() @IsString() @MaxLength(500) recruiterLinkedin?: string | null;
  @IsOptional() @IsEnum(ConnectionStatus) connectionStatus?: ConnectionStatus;
  @IsOptional() @IsEnum(MessageStatus) msg1Status?: MessageStatus;
  @IsOptional() @IsEnum(MessageStatus) msg2Status?: MessageStatus;
  @IsOptional() @IsEnum(MessageStatus) msg3Status?: MessageStatus;
  @IsOptional() @IsBoolean() recruiterReplied?: boolean;
  @IsOptional() @IsBoolean() needsReply?: boolean;
}

export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}

export class StatusDto {
  @IsEnum(ApplicationStatus) status: ApplicationStatus;
}

export class BulkStatusDto {
  @IsString({ each: true }) ids: string[];
  @IsEnum(ApplicationStatus) status: ApplicationStatus;
}

export class BulkDeleteDto {
  @IsString({ each: true }) ids: string[];
}
