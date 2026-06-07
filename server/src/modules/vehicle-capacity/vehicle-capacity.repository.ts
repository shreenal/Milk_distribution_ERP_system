import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

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
}