import { Body, Controller, Get, Module, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Public } from '../auth/firebase-auth.guard';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.module';

class LayoutItem {
  @IsString() @MaxLength(50) id: string;
  @IsBoolean() visible: boolean;
}

export class DashboardLayoutDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LayoutItem) sections: LayoutItem[];
}

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findUnique({ where: { id: user.id } });
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
