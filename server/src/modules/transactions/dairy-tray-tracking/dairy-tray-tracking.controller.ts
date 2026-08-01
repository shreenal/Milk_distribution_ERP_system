import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { DairyTrayTrackingService } from './dairy-tray-tracking.service.js';
import { SaveDairyTrayEntriesDto } from './dto/save-dairy-tray-entries.dto.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('dairy-tray-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DairyTrayTrackingController {
  constructor(
    private readonly dairyTrayTrackingService: DairyTrayTrackingService,
  ) {}

  @Get(':paperId')
  @Roles('EMPLOYEE')
  getDairyTrayGrid(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.dairyTrayTrackingService.getDairyTrayGrid(paperId);
  }

  @Post(':paperId/save')
  @Roles('EMPLOYEE')
  saveDairyTrayEntries(
    @Param('paperId', ParseIntPipe)
    paperId: number,

    @Body()
    dto: SaveDairyTrayEntriesDto,
  ) {
    return this.dairyTrayTrackingService.saveDairyTrayEntries(paperId, dto);
  }
}
