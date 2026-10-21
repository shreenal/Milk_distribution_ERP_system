import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
} from '@nestjs/common';
import { ClientTraysService } from './client-trays.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SaveTrayEntriesRequestDto } from './dto/save-trays-entries.dto.js';
import { Throttle } from '@nestjs/throttler';
import { RecalculateClientTraysRangeDto } from './dto/recalculate-client-trays.dto.js';
import { StripUnknownTrayFieldsInterceptor } from './strip-unknown-tray-fields.interceptor.js';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

@Controller('client-trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientTraysController {
  constructor(private readonly clienttraysService: ClientTraysService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getTraySheet(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
  ) {
    return this.clienttraysService.getTraySheetService(sheetId);
  }

  @Post('sheet/:sheetId/save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(StripUnknownTrayFieldsInterceptor)
  async saveTrayEntries(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,

    @Body() dto: SaveTrayEntriesRequestDto,
  ) {
    return this.clienttraysService.saveTrayEntriesService(
      sheetId,
      dto.entries,
      dto.expectedUpdatedAt,
    );
  }

  // CT-15.5: administrative reconciliation of inactive tray types. Same body
  // and rules as the normal save, but only inactive tray types can be
  // changed, and only an admin can call it.
  @Post('sheet/:sheetId/reconcile-inactive')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(StripUnknownTrayFieldsInterceptor)
  async reconcileInactiveTrayTypes(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,

    @Body() dto: SaveTrayEntriesRequestDto,
  ) {
    return this.clienttraysService.saveTrayEntriesService(
      sheetId,
      dto.entries,
      dto.expectedUpdatedAt,
      { reconcileInactive: true },
    );
  }

  // Decision 26: administrative recalculation over a sale-date range.
  @Post('recalculate')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async recalculateRange(@Body() dto: RecalculateClientTraysRangeDto) {
    return this.clienttraysService.requestRangeRecalculationService(
      dto.fromDate,
      dto.toDate,
    );
  }
}
