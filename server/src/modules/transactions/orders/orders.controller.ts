import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { OrdersService } from './orders.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SaveNightEntriesDto } from './dto/save-night-entries.dto.js';
import { SaveMorningEntriesDto } from './dto/save-morning-entries.dto.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getSheet(@Param('sheetId', ParseIntPipe) sheetId: number) {
    return this.ordersService.getSheetService(sheetId);
  }

  @Get('sheet/:sheetId/items')
  @Roles('EMPLOYEE')
  async getSheetItems(
    @Param('sheetId')
    sheetId: string,
  ) {
    return this.ordersService.getSheetItemsService(Number(sheetId));
  }

  @Post('sheet/:sheetId/night-save')
  @Roles('EMPLOYEE')
  async saveNightEntries(
    @Param('sheetId') sheetId: string,
    @Body() entries: SaveNightEntriesDto[],
  ) {
    try {
      return await this.ordersService.saveNightEntriesService(
        Number(sheetId),
        entries,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to save night entries',
      );
    }
  }

  @Post('sheet/:sheetId/morning-save')
  @Roles('EMPLOYEE')
  async saveMorningEntries(
    @Param('sheetId')
    sheetId: string,

    @Body()
    entries: SaveMorningEntriesDto[],
  ) {
    return this.ordersService.saveMorningEntriesService(
      Number(sheetId),

      entries,
    );
  }
}
