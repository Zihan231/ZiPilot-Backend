import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Prisma, PresetScope } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RawQuery, str } from '../common/query';
import { PrismaService } from '../prisma/prisma.module';

export class CreatePresetDto {
  @IsEnum(PresetScope) scope: PresetScope;
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsString() @MaxLength(4000) query: string;
}

@Injectable()
export class PresetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, q: RawQuery) {
    const scope = str(q, 'scope') as PresetScope | undefined;
    return this.prisma.filterPreset.findMany({
      where: { userId: user.id, ...(scope && Object.values(PresetScope).includes(scope) ? { scope } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreatePresetDto) {
    try {
      return await this.prisma.filterPreset.upsert({
        where: { userId_scope_name: { userId: user.id, scope: dto.scope, name: dto.name } },
        update: { query: dto.query },
        create: { userId: user.id, scope: dto.scope, name: dto.name, query: dto.query },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Preset name already exists');
      throw e;
    }
  }

  async remove(user: AuthUser, id: string) {
    const p = await this.prisma.filterPreset.findFirst({ where: { id, userId: user.id } });
    if (!p) throw new NotFoundException('Preset not found');
    await this.prisma.filterPreset.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('presets')
export class PresetsController {
  constructor(private readonly svc: PresetsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: RawQuery) { return this.svc.list(u, q); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePresetDto) { return this.svc.create(u, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.remove(u, id); }
}

@Module({ controllers: [PresetsController], providers: [PresetsService] })
export class PresetsModule {}
