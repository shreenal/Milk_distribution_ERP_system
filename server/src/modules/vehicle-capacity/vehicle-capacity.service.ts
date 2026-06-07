import { Injectable, BadRequestException } from "@nestjs/common";
import { VehicleCapacityBuilder } from "./vehicle-capacity.builder.js";
import { VehicleCapacityRepository } from "./vehicle-capacity.repository.js";
import { SaveVehicleAllocationDto }
    from './dto/save-vehicle-allocation.dto.js';

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


    async getGroupAllocations(
        paperId: number,
    ) {

        const vehicleCapacityPaper =
            await this
                .vehicleCapacityRepository
                .findVehicleCapacityPaperByOrderPaperId(
                    paperId,
                );

        if (!vehicleCapacityPaper) {

            return {
                allocations: [],
            };
        }

        const allocations =
            await this
                .vehicleCapacityRepository
                .findGroupAllocations(
                    vehicleCapacityPaper.id,
                );

        return {
            allocations,
        };
    }

    async saveGroupAllocations(
        paperId: number,
        dto: SaveVehicleAllocationDto,
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

        let vehicleCapacityPaper =
            await this
                .vehicleCapacityRepository
                .findVehicleCapacityPaperByOrderPaperId(
                    paperId,
                );

        if (!vehicleCapacityPaper) {

            vehicleCapacityPaper =
                await this
                    .vehicleCapacityRepository
                    .createVehicleCapacityPaper(
                        paperId,
                    );
        }

        await this
            .vehicleCapacityRepository
            .deleteGroupAllocations(
                vehicleCapacityPaper.id,
            );

        await this
            .vehicleCapacityRepository
            .createGroupAllocations(

                dto.allocations.map(
                    allocation => ({

                        vehicle_capacity_paper_id:
                            vehicleCapacityPaper.id,

                        group_id:
                            allocation.groupId,

                        vehicle_id:
                            allocation.vehicleId,
                    }),
                ),
            );

        return this
            .vehicleCapacityRepository
            .findGroupAllocations(
                vehicleCapacityPaper.id,
            );
    }

    async getVehicleSummary(
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

        const groupSummary =
            await this
                .getGroupSummary(
                    paperId,
                );

        const vehicleCapacityPaper =
            await this
                .vehicleCapacityRepository
                .findVehicleCapacityPaperByOrderPaperId(
                    paperId,
                );

        if (!vehicleCapacityPaper) {

            throw new BadRequestException(
                'Group allocations not found',
            );
        }

        const groupAllocations =
            await this
                .vehicleCapacityRepository
                .findGroupAllocations(
                    vehicleCapacityPaper.id,
                );

        const vehicles =
            await this
                .vehicleCapacityRepository
                .findVehicles();

        return this
            .vehicleCapacityBuilder
            .buildVehicleSummary(

                groupSummary,

                groupAllocations,

                vehicles,
            );
    }
}