import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { CollectionsService } from './collections.service.js';
import { SaveAdminCollectionsDto } from './dto/save-admin-collection.dto.js';
import { SaveNightCollectionsDto } from './dto/save-night-collection.dto.js';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

import { SaveMorningCollectionsDto } from './dto/save-morning-collection.dto.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SupplyCategory } from '../../../generated/prisma/client.js';
import { Throttle } from '@nestjs/throttler';

type AuthRequest = Request & {
  user: { id: number; username: string; role: string };
};

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('/sheet/:sheetId')
  @Roles('EMPLOYEE')
  getCollectionGrid(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.getCollectionGrid(sheetId, req.user.role);
  }

  @Post('/sheet/:sheetId/milk/night-save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveMilkNightCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveNightCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveNightCollections(
      sheetId,
      SupplyCategory.MILK,
      dto,
      req.user.role,
    );
  }

  @Post('/sheet/:sheetId/non-milk/night-save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveNonMilkNightCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveNightCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveNightCollections(
      sheetId,
      SupplyCategory.NON_MILK,
      dto,
      req.user.role,
    );
  }

  @Post('/sheet/:sheetId/milk/morning-save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveMilkMorningCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveMorningCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveMorningCollections(
      sheetId,
      SupplyCategory.MILK,
      dto,
      req.user.role,
    );
  }

  @Post('/sheet/:sheetId/non-milk/morning-save')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveNonMilkMorningCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveMorningCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveMorningCollections(
      sheetId,
      SupplyCategory.NON_MILK,
      dto,
      req.user.role,
    );
  }

  @Post('/sheet/:sheetId/milk/admin-save')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveMilkAdminCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveAdminCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveAdminCollections(
      sheetId,
      SupplyCategory.MILK,
      dto,
      req.user.role,
    );
  }

  @Post('/sheet/:sheetId/non-milk/admin-save')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200) // CD-11.1: saves answer 200, as Orders
  saveNonMilkAdminCollections(
    @Param('sheetId', ParseIdPipe)
    sheetId: number,
    @Body()
    dto: SaveAdminCollectionsDto,
    @Req() req: AuthRequest,
  ) {
    return this.collectionsService.saveAdminCollections(
      sheetId,
      SupplyCategory.NON_MILK,
      dto,
      req.user.role,
    );
  }
}
