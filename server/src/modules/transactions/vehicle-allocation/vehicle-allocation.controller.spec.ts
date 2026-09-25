import 'reflect-metadata';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import {
  DeliverySession,
  SupplyCategory,
} from '../../../generated/prisma/client.js';
import { VehicleAllocationController } from './vehicle-allocation.controller.js';
import { VehicleAllocationService } from './vehicle-allocation.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('VehicleAllocationController', () => {
  let controller: VehicleAllocationController;

  const vehicleAllocationService = {
    getVehicleAllocations: vi.fn(),
    saveVehicleAllocations: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new VehicleAllocationController(
      vehicleAllocationService as unknown as VehicleAllocationService,
    );
  });

  describe('getVehicleAllocations', () => {
    it('passes paperId and session to the service', async () => {
      const expected = {
        paper: { id: 123 },
        vehicleAssignments: [],
        allocationGrids: [],
        requirementGrids: [],
      };

      vehicleAllocationService.getVehicleAllocations.mockResolvedValue(
        expected,
      );

      const result = await controller.getVehicleAllocations(
        123,
        DeliverySession.MORNING,
      );

      expect(
        vehicleAllocationService.getVehicleAllocations,
      ).toHaveBeenCalledTimes(1);

      expect(
        vehicleAllocationService.getVehicleAllocations,
      ).toHaveBeenCalledWith(123, DeliverySession.MORNING);

      expect(result).toBe(expected);
    });

    it('supports NON_MORNING delivery sessions', async () => {
      const expected = { success: true };

      vehicleAllocationService.getVehicleAllocations.mockResolvedValue(
        expected,
      );

      const result = await controller.getVehicleAllocations(
        456,
        DeliverySession.NIGHT,
      );

      expect(
        vehicleAllocationService.getVehicleAllocations,
      ).toHaveBeenCalledWith(456, DeliverySession.NIGHT);

      expect(result).toBe(expected);
    });

    it('propagates service errors', async () => {
      const error = new BadRequestException('Order paper not found');

      vehicleAllocationService.getVehicleAllocations.mockRejectedValue(error);

      await expect(
        controller.getVehicleAllocations(999, DeliverySession.MORNING),
      ).rejects.toBe(error);
    });
  });

  describe('saveVehicleAllocations', () => {
    it('passes paperId and dto to the service', async () => {
      const dto = {
        assignments: [
          {
            vehicleId: 1,
            milkDistributorId: 10,
            nonMilkDistributorId: null,
          },
        ],
        allocations: [
          {
            vehicleId: 1,
            distributorId: 10,
            category: SupplyCategory.MILK,
            productId: 100,
            allocatedQty: 25,
          },
        ],
      };

      const expected = {
        success: true,
        changed: true,
      };

      vehicleAllocationService.saveVehicleAllocations.mockResolvedValue(
        expected,
      );

      const result = await controller.saveVehicleAllocations(123, dto);

      expect(
        vehicleAllocationService.saveVehicleAllocations,
      ).toHaveBeenCalledTimes(1);

      expect(
        vehicleAllocationService.saveVehicleAllocations,
      ).toHaveBeenCalledWith(123, dto);

      expect(result).toBe(expected);
    });

    it('passes expectedUpdatedAt without modifying the dto', async () => {
      const dto = {
        assignments: [],
        allocations: [],
        expectedUpdatedAt: '2026-01-01T10:00:00.000Z',
      };

      vehicleAllocationService.saveVehicleAllocations.mockResolvedValue({
        success: true,
        changed: false,
      });

      await controller.saveVehicleAllocations(456, dto);

      expect(
        vehicleAllocationService.saveVehicleAllocations,
      ).toHaveBeenCalledWith(456, dto);

      expect(dto.expectedUpdatedAt).toBe('2026-01-01T10:00:00.000Z');
    });

    it('propagates service errors', async () => {
      const error = new Error('Persistence failed');

      vehicleAllocationService.saveVehicleAllocations.mockRejectedValue(error);

      const dto = {
        assignments: [],
        allocations: [],
      };

      await expect(
        controller.saveVehicleAllocations(123, dto as never),
      ).rejects.toBe(error);
    });
  });

  describe('route metadata', () => {
    it('uses the vehicle-allocations controller prefix', () => {
      const path = Reflect.getMetadata('path', VehicleAllocationController);

      expect(path).toBe('vehicle-allocations');
    });

    it('uses JwtAuthGuard and RolesGuard at controller level', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        VehicleAllocationController,
      );

      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    });

    it('requires EMPLOYEE role for the controller endpoints', () => {
      const roleMetadata = Reflect.getMetadata(
        'roles',
        VehicleAllocationController.prototype.getVehicleAllocations,
      );

      expect(roleMetadata).toEqual(['EMPLOYEE']);

      const saveRoleMetadata = Reflect.getMetadata(
        'roles',
        VehicleAllocationController.prototype.saveVehicleAllocations,
      );

      expect(saveRoleMetadata).toEqual(['EMPLOYEE']);
    });
  });
});
