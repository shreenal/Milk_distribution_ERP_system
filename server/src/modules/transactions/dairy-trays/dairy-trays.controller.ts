import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { DairyTraysService } from './dairy-trays.service.js';
import { SaveDairyTrayEntriesDto } from './dto/save-dairy-tray-entries.dto.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('dairy-trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DairyTraysController {
  constructor(private readonly dairyTraysService: DairyTraysService) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  getDairyTrayGrid(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.dairyTraysService.getDairyTrayGrid(paperId);
  }

  @Post(':paperId/save')
  @Roles('EMPLOYEE')
  saveDairyTrayEntries(
    @Param('paperId', ParseIntPipe)
    paperId: number,

    @Body()
    dto: SaveDairyTrayEntriesDto,
  ) {
    return this.dairyTraysService.saveDairyTrayEntries(paperId, dto);
  }
}
