import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { TraysService } from './trays.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';

@Controller('trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TraysController {
  constructor(private readonly traysService: TraysService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getTraySheet(
    @Param('sheetId')
    sheetId: string,
  ) {
    return this.traysService.getTraySheetService(Number(sheetId));
  }

  @Post('sheet/:sheetId/save')
  @Roles('EMPLOYEE')
  async saveTrayEntries(
    @Param('sheetId')
    sheetId: string,

    @Body()
    entries: SaveTrayReturnDto[],
  ) {
    return this.traysService.saveTrayEntriesService(
      Number(sheetId),

      entries,
    );
  }
}
