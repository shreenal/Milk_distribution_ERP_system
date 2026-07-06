import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CollectionsService } from './collections.service.js';
import { SaveAdminCollectionsDto } from './dto/save-admin-collection.dto.js';
import { SaveNightCollectionsDto } from './dto/save-night-collection.dto.js';

import { SaveMorningCollectionsDto } from './dto/save-morning-collection.dto.js';

import { JwtAuthGuard } from '../auth/auth.guard.js';

import { RolesGuard } from '../auth/roles.guard.js';

import { Roles } from '../auth/roles.decorator.js';
import { SupplyCategory } from '../../generated/prisma/client.js';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('/sheet/:sheetId')
  @Roles('EMPLOYEE')
  getCollectionGrid(
    @Param('sheetId', ParseIntPipe)
    sheetId: number,
  ) {
    return this.collectionsService.getCollectionGrid(sheetId);
  }

  @Post('/sheet/:sheetId/milk/night-save')
@Roles('EMPLOYEE')
saveMilkNightCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveNightCollectionsDto,
) {
  return this.collectionsService.saveNightCollections(
    sheetId,
    SupplyCategory.MILK,
    dto,
  );
}

@Post('/sheet/:sheetId/non-milk/night-save')
@Roles('EMPLOYEE')
saveNonMilkNightCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveNightCollectionsDto,
) {
  return this.collectionsService.saveNightCollections(
    sheetId,
    SupplyCategory.NON_MILK,
    dto,
  );
}

  @Post('/sheet/:sheetId/milk/morning-save')
@Roles('EMPLOYEE')
saveMilkMorningCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveMorningCollectionsDto,
) {
  return this.collectionsService.saveMorningCollections(
    sheetId,
    SupplyCategory.MILK,
    dto,
  );
}

@Post('/sheet/:sheetId/non-milk/morning-save')
@Roles('EMPLOYEE')
saveNonMilkMorningCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveMorningCollectionsDto,
) {
  return this.collectionsService.saveMorningCollections(
    sheetId,
    SupplyCategory.NON_MILK,
    dto,
  );
}

  @Post('/sheet/:sheetId/milk/admin-save')
@Roles('ADMIN')
saveMilkAdminCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveAdminCollectionsDto,
) {
  return this.collectionsService.saveAdminCollections(
    sheetId,
    SupplyCategory.MILK,
    dto,
  );
}

@Post('/sheet/:sheetId/non-milk/admin-save')
@Roles('ADMIN')
saveNonMilkAdminCollections(
  @Param('sheetId', ParseIntPipe)
  sheetId: number,

  @Body()
  dto: SaveAdminCollectionsDto,
) {
  return this.collectionsService.saveAdminCollections(
    sheetId,
    SupplyCategory.NON_MILK,
    dto,
  );
}
}
