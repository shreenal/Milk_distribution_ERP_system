import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma} from '../../generated/prisma/client.js';

@Injectable()
export class VehicleAllocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrderPaperById(paperId: number) {
    return this.prisma.order_paper.findUnique({
      where: {
        id: paperId,
      },
    });
  }

  async findDistributorProcurementRules() {
    return this.prisma.distributor_procurement_rule.findMany({
      where: {
        is_active: true,
      },
    });
  }

  async findOrderSheetsByPaperId(paperId: number) {
    return this.prisma.order_sheet.findMany({
      where: {
        order_paper_id: paperId,
      },
      include: {
        master_group: true,
      },
    });
  }

  async findSheetItemsByPaperId(paperId: number) {
    return this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },

      include: {
        master_product: {
          include: {
            master_brand: true,

            master_product_group: true,

            master_product_type: true,

            master_packaging_type: true,
          },
        },
      },
    });
  }

  async findDistributors() {
    return this.prisma.master_distributor.findMany({
      where: {
        is_active: true,
      },

      orderBy: {
        id: 'asc',
      },
    });
  }

  async findProducts() {
    return this.prisma.master_product.findMany({
      include: {
        master_brand: true,

        master_product_group: true,

        master_product_type: true,

        master_packaging_type: true,
      },

      orderBy: {
        id: 'asc',
      },
    });
  }

  async findVehicles() {
    return this.prisma.master_vehicle.findMany({
      where: {
        is_active: true,
      },
    });
  }

  async findVehicleAllocationPaperByOrderPaperId(orderPaperId: number) {
    return this.prisma.vehicle_allocation_paper.findUnique({
      where: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async createVehicleAllocationPaper(orderPaperId: number) {
    return this.prisma.vehicle_allocation_paper.create({
      data: {
        order_paper_id: orderPaperId,
      },
    });
  }

  async deleteVehicleAllocations(vehicleAllocationPaperId: number) {
    return this.prisma.vehicle_allocation.deleteMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
    });
  }

  async createVehicleAllocations(
    data: Prisma.vehicle_allocationCreateManyInput[],
  ) {
    return this.prisma.vehicle_allocation.createMany({
      data,
    });
  }

  async findVehicleAllocations(vehicleAllocationPaperId: number) {
    return this.prisma.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },

      include: {
        master_vehicle: true,
        master_product: true,
      },

      orderBy: [
        { vehicle_id: 'asc' },
        { distributor_id: 'asc' },
        { category: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async findVehicleAllocationsByPaperId(orderPaperId: number) {
    return this.prisma.vehicle_allocation.findMany({
      where: {
        vehicle_allocation_paper: {
          order_paper_id: orderPaperId,
        },
      },

      include: {
        master_vehicle: true,

        master_product: {
          include: {
            master_brand: true,

            master_product_group: true,

            master_product_type: true,

            master_packaging_type: true,
          },
        },
      },

      orderBy: [
        { vehicle_id: 'asc' },
        { distributor_id: 'asc' },
        { category: 'asc' },
        { product_id: 'asc' },
      ],
    });
  }

  async replaceVehicleAllocations(
    vehicleAllocationPaperId: number,
    data: Prisma.vehicle_allocationCreateManyInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicle_allocation.deleteMany({
        where: {
          vehicle_allocation_paper_id: vehicleAllocationPaperId,
        },
      });

      if (data.length > 0) {
        await tx.vehicle_allocation.createMany({
          data,
        });
      }
    });
  }

  async findVehicleAssignments(vehicleAllocationPaperId: number) {
    return this.prisma.vehicle_distribution_assignment.findMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },

      include: {
        master_vehicle: true,

        master_distributor: true,
      },

      orderBy: [{ vehicle_id: 'asc' }, { category: 'asc' }],
    });
  }

  
  async getProductLink(distributorId: number, productId: number) {
    return this.prisma.master_product_link.findUnique({
      where: {
        distributor_id_product_id: {
          distributor_id: distributorId,
          product_id: productId,
        },
      },
      select: {
        id: true,
        distributor_id: true,
        product_id: true,
      },
    });
  }

  async deleteVehicleAssignments(vehicleAllocationPaperId: number) {
    return this.prisma.vehicle_distribution_assignment.deleteMany({
      where: {
        vehicle_allocation_paper_id: vehicleAllocationPaperId,
      },
    });
  }

  async createVehicleAssignments(
    data: Prisma.vehicle_distribution_assignmentCreateManyInput[],
  ) {
    return this.prisma.vehicle_distribution_assignment.createMany({
      data,
    });
  }

  async replaceVehicleAssignments(
    vehicleAllocationPaperId: number,

    data: Prisma.vehicle_distribution_assignmentCreateManyInput[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicle_distribution_assignment.deleteMany({
        where: {
          vehicle_allocation_paper_id: vehicleAllocationPaperId,
        },
      });

      if (data.length > 0) {
        await tx.vehicle_distribution_assignment.createMany({
          data,
        });
      }
    });
  }

  async findOrderItemsWithSupplyContextByPaperId(paperId: number) {
    const items = await this.prisma.order_sheet_items.findMany({
      where: {
        order_sheet: {
          order_paper_id: paperId,
        },
      },
      include: {
        order_sheet: {
          include: {
            master_group: {
              include: {
                supply_rules: true,
              },
            },
          },
        },
        master_product: {
          include: {
            master_brand: true,
            master_product_group: true,
            master_product_type: true,
            master_packaging_type: true,
          },
        },
      },
    });

    return items.map((item) => {
      const category = item.master_product.master_product_group.category;
      const supplyRule = item.order_sheet.master_group.supply_rules.find(
        (rule) => rule.category === category,
      );

      if (!supplyRule) {
        throw new Error(
          `Missing supply rule for group ${item.order_sheet.master_group.name} and category ${category}`,
        );
      }

      return {
        groupId: item.order_sheet.group_id,
        groupName: item.order_sheet.master_group.name,
        productId: item.product_id,
        orderedQty: Number(item.ordered_qty ?? 0),
        distributorId: supplyRule.distributor_id,
        category,
        master_product: item.master_product,
      };
    });
  }
}
