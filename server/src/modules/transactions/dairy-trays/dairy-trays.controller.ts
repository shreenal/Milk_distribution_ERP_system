import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { DairyTraysService } from './dairy-trays.service.js';
import { SaveDairyTrayEntriesDto } from './dto/save-dairy-tray-entries.dto.js';
import { RecalculateDairyTraysRangeDto } from './dto/recalculate-dairy-trays.dto.js';
import { StripUnknownDairyTrayFieldsInterceptor } from './strip-unknown-dairy-tray-fields.interceptor.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

@Controller('dairy-trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DairyTraysController {
  constructor(private readonly dairyTraysService: DairyTraysService) {}

  // DT-11.1: administrative recalculation over a sale-date range.
  @Post('recalculate')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  recalculateRange(@Body() dto: RecalculateDairyTraysRangeDto) {
    return this.dairyTraysService.requestRangeRecalculationService(
      dto.fromDate,
      dto.toDate,
    );
  }

  @Get(':paperId')
  @Roles('EMPLOYEE')
  getDairyTrayGrid(@Param('paperId', ParseIdPipe) paperId: number) {
    return this.dairyTraysService.getDairyTrayGrid(paperId);
  }

  @Post(':paperId/save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(StripUnknownDairyTrayFieldsInterceptor)
  saveDairyTrayEntries(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Body() dto: SaveDairyTrayEntriesDto,
  ) {
    return this.dairyTraysService.saveDairyTrayEntries(paperId, dto);
  }

  // DT-5.11: administrative reconciliation of inactive vehicles / tray types.
  // Same body and rules as the normal save, but only entries for an inactive
  // vehicle or tray type can be changed, and only an admin can call it.
  @Post(':paperId/reconcile-inactive')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(StripUnknownDairyTrayFieldsInterceptor)
  reconcileInactive(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Body() dto: SaveDairyTrayEntriesDto,
  ) {
    return this.dairyTraysService.saveDairyTrayEntries(paperId, dto, {
      reconcileInactive: true,
    });
  }
}
