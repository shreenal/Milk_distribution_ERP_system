import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ClientTraysService } from './client-trays.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import {
  SaveTrayEntriesRequestDto,
  SaveTrayReturnDto,
} from './dto/save-trays-entries.dto.js';
import { Throttle } from '@nestjs/throttler';

@Controller('client-trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientTraysController {
  constructor(private readonly clienttraysService: ClientTraysService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getTraySheet(
    @Param('sheetId', ParseIntPipe)
    sheetId: string,
  ) {
    return this.clienttraysService.getTraySheetService(Number(sheetId));
  }

  @Post('sheet/:sheetId/save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async saveTrayEntries(
    @Param('sheetId', ParseIntPipe)
    sheetId: number,

    @Body() dto: SaveTrayEntriesRequestDto,
  ) {
    return this.clienttraysService.saveTrayEntriesService(
      Number(sheetId),
      dto.entries,
      dto.expectedUpdatedAt,
    );
  }
}
