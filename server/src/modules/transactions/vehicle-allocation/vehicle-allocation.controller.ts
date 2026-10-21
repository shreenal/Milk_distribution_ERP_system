import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { ReconcileVehicleAllocationDto } from './dto/reconcile-vehicle-allocation.dto.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { DeliverySession } from '../../../generated/prisma/client.js';
import { Throttle } from '@nestjs/throttler';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';
// VA-1: no endpoint has an admin-only branch. ADMIN passes the EMPLOYEE role
// through the hierarchy and is subject to exactly the same rules.
@Controller('vehicle-allocations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleAllocationController {
  constructor(
    private readonly vehicleAllocationService: VehicleAllocationService,
  ) {}

  @Get(':paperId/vehicle-allocations')
  @Roles('EMPLOYEE')
  async getVehicleAllocations(
    @Param('paperId', ParseIdPipe) paperId: number,
    @Query('session', new ParseEnumPipe(DeliverySession))
    session: DeliverySession,
  ) {
    return this.vehicleAllocationService.getVehicleAllocations(
      paperId,
      session,
    );
  }

  @Post(':paperId/vehicle-allocations')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async saveVehicleAllocations(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Body()
    dto: SaveVehicleAllocationDto,
  ) {
    return this.vehicleAllocationService.saveVehicleAllocations(paperId, dto);
  }

  // VA-7.4: removes invalid allocations (keeping the evidence) and closes
  // resolved flags, without changing any quantity.
  @Post(':paperId/vehicle-allocations/reconcile')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async reconcileVehicleAllocations(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Body()
    dto: ReconcileVehicleAllocationDto,
  ) {
    return this.vehicleAllocationService.reconcileVehicleAllocations(
      paperId,
      dto,
    );
  }
}
