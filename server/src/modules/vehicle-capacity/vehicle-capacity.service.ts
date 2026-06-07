import { Injectable, BadRequestException } from "@nestjs/common";
import { VehicleCapacityBuilder } from "./vehicle-capacity.builder.js";
import { VehicleCapacityRepository } from "./vehicle-capacity.repository.js";

@Injectable()
export class VehicleCapacityService {

    constructor(

        private readonly vehicleCapacityRepository:
            VehicleCapacityRepository,

        private readonly vehicleCapacityBuilder:
            VehicleCapacityBuilder,
    ) { }

    async getGroupSummary(
        paperId: number,
    ) {

        const paper =
            await this
                .vehicleCapacityRepository
                .findOrderPaperById(
                    paperId,
                );

        if (!paper) {

            throw new BadRequestException(
                'Order paper not found',
            );
        }

        const sheets =
            await this
                .vehicleCapacityRepository
                .findOrderSheetsByPaperId(
                    paperId,
                );

        const sheetItems =
            await this
                .vehicleCapacityRepository
                .findSheetItemsByPaperId(
                    paperId,
                );

        const milkProducts =
    await this.vehicleCapacityRepository
        .findMilkProducts();

const nonMilkProducts =
    await this.vehicleCapacityRepository
        .findNonMilkProducts();

        return this
            .vehicleCapacityBuilder
            .buildGroupSummary(

                sheets,

                sheetItems,

                milkProducts,

                nonMilkProducts,
            );
    }
}