import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { OrdersService } from './orders.service.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SaveNightEntriesRequestDto } from './dto/save-night-entries.dto.js';
import { SaveMorningEntriesRequestDto } from './dto/save-morning-entries.dto.js';
import { Query, ParseEnumPipe } from '@nestjs/common';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { AddProductDto } from './dto/add-product.dto.js';
import { Throttle } from '@nestjs/throttler';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getSheet(@Param('sheetId', ParseIdPipe) sheetId: number) {
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
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
  ) {
    return this.ordersService.getSheetItemsService(sheetId);
  }

  @Post('sheet/:sheetId/night-save')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Roles('EMPLOYEE')
  async saveNightEntries(
    @Param('sheetId', ParseIdPipe) sheetId: number,
    @Body() dto: SaveNightEntriesRequestDto,
  ) {
    return await this.ordersService.saveNightEntriesService(
      sheetId,
      dto.entries,
      dto.expectedUpdatedAt,
    );
  }

  @Post('sheet/:sheetId/morning-save')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Roles('EMPLOYEE')
  async saveMorningEntries(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body() dto: SaveMorningEntriesRequestDto,
  ) {
    return this.ordersService.saveMorningEntriesService(
      sheetId,

      dto.entries,
      dto.expectedUpdatedAt,
    );
  }

  @Post('sheet/:sheetId/products')
  @Roles('EMPLOYEE')
  async addProduct(
    @Param('sheetId', ParseIdPipe) sheetId: number,
    @Body() dto: AddProductDto,
  ) {
    return this.ordersService.addProductToSheet(sheetId, dto);
  }

  @Delete('sheet/:sheetId/products/:productId')
  @Roles('EMPLOYEE')
  async removeProduct(
    @Param('sheetId', ParseIdPipe) sheetId: number,
    @Param('productId', ParseIdPipe) productId: number,
    @Query('expectedUpdatedAt') expectedUpdatedAt?: string,
  ) {
    // OD-12.7: omission is invalid. Explicit null is sent as the literal text "null".
    if (expectedUpdatedAt === undefined || expectedUpdatedAt === '') {
      throw new BadRequestException(
        'expectedUpdatedAt is required. Send the last itemsUpdatedAt, or the literal "null" if the sheet has never been saved.',
      );
    }
    // a query string cannot carry a JSON null, so the literal text "null" is the
    // explicit-null token; any other value is parsed by the service
    const token = expectedUpdatedAt === 'null' ? null : expectedUpdatedAt;
    return this.ordersService.removeProductFromSheet(sheetId, productId, token);
  }
}
