import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";

@Injectable()
export class VehicleCapacityRepository {

    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async findOrderPaperById(
        paperId: number,
    ) {
        return this.prisma.order_paper.findUnique({
            where: {
                id: paperId,
            },
        });
    }

    async findOrderSheetsByPaperId(
        paperId: number,
    ) {
        return this.prisma.order_sheet.findMany({
            where: {
                order_paper_id: paperId,
            },
            include: {
                master_group: true,
            },
        });
    }

    async findSheetItemsByPaperId(
    paperId: number,
) {
    return this.prisma.order_sheet_items.findMany({
        where: {
            order_sheet: {
                order_paper_id: paperId,
            },
        },

        include: {
            master_product: true,
        },
    });
}

    async findMilkProducts() {

    return this.prisma.master_product.findMany({

        where: {

            master_product_group: {

                name: 'Milk',
            },
        },

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


async findNonMilkProducts() {

    return this.prisma.master_product.findMany({

        where: {

            master_product_group: {

                name: 'Non-Milk',
            },
        },

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

    async findVehicleCapacityPaperByOrderPaperId(
    orderPaperId: number,
) {
    return this.prisma.vehicle_capacity_paper.findUnique({
        where: {
            order_paper_id: orderPaperId,
        },
    });
}

    async createVehicleCapacityPaper(
    orderPaperId: number,
) {
    return this.prisma.vehicle_capacity_paper.create({
        data: {
            order_paper_id: orderPaperId,
        },
    });
}

async deleteGroupAllocations(
    vehicleCapacityPaperId: number,
) {
    return this.prisma.vehicle_group_allocation.deleteMany({
        where: {
            vehicle_capacity_paper_id:
                vehicleCapacityPaperId,
        },
    });
}


async createGroupAllocations(
    data: Prisma.vehicle_group_allocationCreateManyInput[],
) {
    return this.prisma.vehicle_group_allocation.createMany({
        data,
    });
}


async findGroupAllocations(
    vehicleCapacityPaperId: number,
) {
    return this.prisma.vehicle_group_allocation.findMany({
        where: {
            vehicle_capacity_paper_id:
                vehicleCapacityPaperId,
        },
        include: {
            master_group: true,
            master_vehicle: true,
        },
        orderBy: {
            group_id: 'asc',
        },
    });
}


async findGroupAllocationsByPaperId(
    orderPaperId: number,
) {
    return this.prisma.vehicle_group_allocation.findMany({
        where: {
            vehicle_capacity_paper: {
                order_paper_id:
                    orderPaperId,
            },
        },

        include: {
            master_group: true,
            master_vehicle: true,
        },

        orderBy: {
            group_id: 'asc',
        },
    });
}
}