import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller('vehicle-allocations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleAllocationController {
  constructor(
    private readonly vehicleAllocationService: VehicleAllocationService,
  ) {}

  @Get(':paperId/vehicle-allocations')
  @Roles('EMPLOYEE')
  async getVehicleAllocations(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.vehicleAllocationService.getVehicleAllocations(paperId);
  }

  @Post(':paperId/vehicle-allocations')
  @Roles('EMPLOYEE')
  async saveVehicleAllocations(
    @Param('paperId', ParseIntPipe)
    paperId: number,
    @Body()
    dto: SaveVehicleAllocationDto,
  ) {
    return this.vehicleAllocationService.saveVehicleAllocations(paperId, dto);
  }
}
