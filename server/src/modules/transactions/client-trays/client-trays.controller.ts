import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ClientTraysService } from './client-trays.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';

@Controller('trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientTraysController {
  constructor(private readonly clienttraysService: ClientTraysService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getTraySheet(
    @Param('sheetId')
    sheetId: string,
  ) {
    return this.clienttraysService.getTraySheetService(Number(sheetId));
  }

  @Post('sheet/:sheetId/save')
  @Roles('EMPLOYEE')
  async saveTrayEntries(
    @Param('sheetId')
    sheetId: string,

    @Body()
    entries: SaveTrayReturnDto[],
  ) {
    return this.clienttraysService.saveTrayEntriesService(
      Number(sheetId),

      entries,
    );
  }
}
