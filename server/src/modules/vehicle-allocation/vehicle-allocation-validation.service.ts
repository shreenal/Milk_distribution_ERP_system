import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SaveVehicleAllocationDto } from './dto/save-vehicle-allocation.dto.js';
import { VehicleAllocationRepository } from './vehicle-allocation.repository.js';
import { VehicleAllocationBuilder } from './vehicle-allocation.builder.js';

@Injectable()
export class VehicleAllocationValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAllocationRepository: VehicleAllocationRepository,
    private readonly vehicleAllocationBuilder: VehicleAllocationBuilder,
  ) {}

  async validateVehicleAllocations(
    paperId: number,
    dto: SaveVehicleAllocationDto,
  ) {
    const groupSummary = await this.getGroupSummary(paperId);

    const vehicles = await this.vehicleAllocationRepository.findVehicles();

    const allocationGrids =
      this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
        groupSummary.summaries,
        vehicles,
      );

    const requiredTotals = new Map<number, number>();

    for (const allocation of allocationGrids.allocations) {
      for (const [field, qty] of Object.entries(allocation.summaryTotal)) {
        const productId = Number(field.replace('product_', ''));

        requiredTotals.set(productId, Number(qty));
      }
    }

    const allocatedTotals = new Map<number, number>();

    for (const allocation of dto.allocations) {
      allocatedTotals.set(
        allocation.productId,

        (allocatedTotals.get(allocation.productId) ?? 0) +
          Number(allocation.allocatedQty),
      );
    }

    for (const [productId, requiredQty] of requiredTotals) {
      const allocatedQty = allocatedTotals.get(productId) ?? 0;

      if (allocatedQty !== requiredQty) {
        throw new BadRequestException(
          `Product ${productId} allocation mismatch. Required: ${requiredQty}, Allocated: ${allocatedQty}`,
        );
      }
    }
  }

  async validateVehicleAllocationsForNightSubmit(paperId: number) {
    const allocationGrid = await this.getAllocationGrid(paperId);

    for (const allocation of allocationGrid.allocations) {
      for (const [field, requiredQty] of Object.entries(
        allocation.summaryTotal,
      )) {
        let allocatedQty = 0;

        for (const row of allocation.rows) {
          allocatedQty += Number(row[field] ?? 0);
        }

        if (allocatedQty !== Number(requiredQty)) {
          throw new BadRequestException(
            `${allocation.brandName} ${allocation.productGroupName} ${field} allocation mismatch. Required: ${requiredQty}, Allocated: ${allocatedQty}`,
          );
        }
      }
    }
  }

  private async getGroupSummary(paperId: number) {
    const sheets =
      await this.vehicleAllocationRepository.findOrderSheetsByPaperId(paperId);

    const sheetItems =
      await this.vehicleAllocationRepository.findSheetItemsByPaperId(paperId);

    const products = await this.vehicleAllocationRepository.findProducts();

    return this.vehicleAllocationBuilder.buildGroupSummary(
      sheets,

      sheetItems,

      products,
    );
  }

  private async getAllocationGrid(paperId: number) {
    const groupSummary = await this.getGroupSummary(paperId);

    const vehicles = await this.vehicleAllocationRepository.findVehicles();

    const allocationGrids =
      this.vehicleAllocationBuilder.buildVehicleAllocationGrids(
        groupSummary.summaries,

        vehicles,
      );

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
      );

    if (!vehicleAllocationPaper) {
      return allocationGrids;
    }

    const savedAllocations =
      await this.vehicleAllocationRepository.findVehicleAllocations(
        vehicleAllocationPaper.id,
      );

    return this.vehicleAllocationBuilder.applyVehicleAllocations(
      allocationGrids,

      savedAllocations,
    );
  }

  async validateVehicleAssignments(
    paperId: number,
    dto: SaveVehicleAllocationDto,
  ) {
    const vehicles = await this.vehicleAllocationRepository.findVehicles();

    const distributors =
      await this.vehicleAllocationRepository.findDistributors();

    const validVehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));

    const validDistributorIds = new Set(
      distributors.map((distributor) => distributor.id),
    );

    const assignedVehicles = new Set<number>();

    for (const assignment of dto.assignments) {
      if (!validVehicleIds.has(assignment.vehicleId)) {
        throw new BadRequestException(
          `Vehicle ${assignment.vehicleId} does not exist`,
        );
      }

      if (!validDistributorIds.has(assignment.distributorId)) {
        throw new BadRequestException(
          `Distributor ${assignment.distributorId} does not exist`,
        );
      }

      if (assignedVehicles.has(assignment.vehicleId)) {
        throw new BadRequestException(
          `Vehicle ${assignment.vehicleId} assigned multiple times`,
        );
      }

      assignedVehicles.add(assignment.vehicleId);
    }
  }

  async validateVehicleAssignmentsForNightSubmit(paperId: number) {
    const allocationGrid = await this.getAllocationGrid(paperId);

    const vehicleAllocationPaper =
      await this.vehicleAllocationRepository.findVehicleAllocationPaperByOrderPaperId(
        paperId,
      );

    if (!vehicleAllocationPaper) {
      throw new BadRequestException('Vehicle allocations not found');
    }

    const assignments =
      await this.vehicleAllocationRepository.findVehicleAssignments(
        vehicleAllocationPaper.id,
      );

    const assignedVehicleIds = new Set(
      assignments.map((assignment) => assignment.vehicle_id),
    );

    const vehiclesWithAllocations = new Set<number>();

    for (const allocation of allocationGrid.allocations) {
      for (const row of allocation.rows) {
        let hasAllocation = false;

        for (const [field, value] of Object.entries(row)) {
          if (!field.startsWith('product_')) {
            continue;
          }

          if (Number(value) > 0) {
            hasAllocation = true;

            break;
          }
        }

        if (hasAllocation) {
          vehiclesWithAllocations.add(row.vehicleId);
        }
      }
    }

    for (const vehicleId of vehiclesWithAllocations) {
      if (!assignedVehicleIds.has(vehicleId)) {
        throw new BadRequestException(
          `Vehicle ${vehicleId} has allocations but no distributor assignment`,
        );
      }
    }
  }
}
