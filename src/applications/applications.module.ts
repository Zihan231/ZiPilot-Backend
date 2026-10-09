import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DateTime } from 'luxon';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RawQuery } from '../common/query';
import { BulkDeleteDto, BulkStatusDto, CreateApplicationDto, StatusDto, UpdateApplicationDto } from './application.dto';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: RawQuery) {
    return this.apps.list(user, q);
  }

  @Get('facets')
  facets(@CurrentUser() user: AuthUser) {
    return this.apps.facets(user);
  }

  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Query() q: RawQuery, @Res() res: Response) {
    const csv = await this.apps.exportCsv(user, q);
    const name = `zipilot-applications-${DateTime.now().toFormat('yyyy-MM-dd')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  }

  @Post('bulk/status')
  bulkStatus(@CurrentUser() user: AuthUser, @Body() dto: BulkStatusDto) {
    return this.apps.bulkStatus(user, dto.ids, dto.status);
  }

  @Post('bulk/delete')
  bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: BulkDeleteDto) {
    return this.apps.bulkRemove(user, dto.ids);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apps.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.apps.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    return this.apps.update(user, id, dto);
  }

  @Patch(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.apps.setStatus(user, id, dto.status);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apps.remove(user, id);
  }
}

@Module({ controllers: [ApplicationsController], providers: [ApplicationsService], exports: [ApplicationsService] })
export class ApplicationsModule {}
