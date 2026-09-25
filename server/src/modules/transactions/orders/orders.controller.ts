import {
  Body,
  Controller,
  Delete,
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
import {
  SaveNightEntriesDto,
  SaveNightEntriesRequestDto,
} from './dto/save-night-entries.dto.js';
import {
  SaveMorningEntriesDto,
  SaveMorningEntriesRequestDto,
} from './dto/save-morning-entries.dto.js';
import { Query, ParseEnumPipe } from '@nestjs/common';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { AddProductDto } from './dto/add-product.dto.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getSheet(@Param('sheetId', ParseIntPipe) sheetId: number) {
    return this.ordersService.getSheetService(sheetId);
  }

  @Get('products')
  @Roles('EMPLOYEE')
  async getAvailableProducts(
    @Query('category', new ParseEnumPipe(SupplyCategory))
    category: SupplyCategory,
  ) {
    return this.ordersService.getAvailableProducts(category);
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
    @Body() dto: SaveNightEntriesRequestDto,
  ) {
    return await this.ordersService.saveNightEntriesService(
      Number(sheetId),
      dto.entries,
      dto.expectedUpdatedAt,
    );
  }

  @Post('sheet/:sheetId/morning-save')
  @Roles('EMPLOYEE')
  async saveMorningEntries(
    @Param('sheetId')
    sheetId: string,
    @Body() dto: SaveMorningEntriesRequestDto,
  ) {
    return this.ordersService.saveMorningEntriesService(
      Number(sheetId),

      dto.entries,
      dto.expectedUpdatedAt,
    );
  }

  @Post('sheet/:sheetId/products')
  @Roles('EMPLOYEE')
  async addProduct(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: AddProductDto,
  ) {
    return this.ordersService.addProductToSheet(sheetId, dto);
  }

  @Delete('sheet/:sheetId/products/:productId')
  @Roles('EMPLOYEE')
  async removeProduct(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.ordersService.removeProductFromSheet(sheetId, productId);
  }
}
