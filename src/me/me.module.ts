import { Body, Controller, Get, Header, Module, Put, ServiceUnavailableException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Public } from '../auth/firebase-auth.guard';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.module';

class LayoutItem {
  @IsString() @MaxLength(50) id: string;
  @IsBoolean() visible: boolean;
}

export class CustomOptionsDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(60, { each: true }) platform: string[];
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(60, { each: true }) appliedVia: string[];
}

export class DashboardLayoutDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LayoutItem) sections: LayoutItem[];
}

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness check for uptime monitors (e.g. UptimeRobot keeping the Render instance awake).
   * No auth, no database work — responds instantly to GET and HEAD.
   */
  @Public()
  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return { ok: true, status: 'up', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  }

  /** Readiness check: also verifies the database connection (returns 503 if it's unreachable). */
  @Public()
  @Get('health/ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ ok: false, status: 'database-unreachable' });
    }
    return { ok: true, status: 'ready', database: 'up', dbLatencyMs: Date.now() - started, timestamp: new Date().toISOString() };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({ where: { id: user.id } });
  }

  /** Saves the user's custom Platform / Applied via choices (trimmed, de-duplicated). */
  @Put('me/options')
  async options(@CurrentUser() user: AuthUser, @Body() dto: CustomOptionsDto) {
    const clean = (arr: string[]) => [...new Map(arr.map((v) => v.trim()).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()];
    const customOptions = { platform: clean(dto.platform), appliedVia: clean(dto.appliedVia) };
    const u = await this.prisma.user.update({ where: { id: user.id }, data: { customOptions } });
    return u.customOptions;
  }

  /** Persists dashboard section order + visibility. */
  @Put('me/dashboard-layout')
  async layout(@CurrentUser() user: AuthUser, @Body() dto: DashboardLayoutDto) {
    const sections = dto.sections.map((s) => ({ id: s.id, visible: s.visible }));
    const u = await this.prisma.user.update({ where: { id: user.id }, data: { dashboardLayout: sections } });
    return u.dashboardLayout;
  }
}

@Module({ controllers: [MeController] })
export class MeModule {}
