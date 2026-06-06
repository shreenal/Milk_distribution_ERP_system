import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { TraysRepository } from './trays.repository.js';
import { TrayBillingBuilder } from './tray.billing-builder.js';
import { SaveTrayReturnDto } from './dto/save-trays-entries.dto.js';
import { TRAY_ERROR_MESSAGES, TRAY_SUCCESS_MESSAGES } from './trays.constants.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';

@Injectable()
export class TraysService {
    private readonly logger = new Logger(TraysService.name);

    constructor(

        private readonly traysRepository:
            TraysRepository,

        private readonly trayBillingBuilder:
            TrayBillingBuilder,

        private readonly workflowStateService:
            WorkflowStateService
    ) { }
    async getTraySheetService(
        sheetId: number,
    ) {

        const sheet =
            await this.traysRepository
                .findSheetById(
                    sheetId,
                );

        if (!sheet) {

            throw new NotFoundException(
                TRAY_ERROR_MESSAGES
                    .SHEET_NOT_FOUND,
            );
        }

        // CLIENTS

        const clients =
            await this.traysRepository
                .getClientsByGroupId(
                    sheet.group_id,
                );

        // ORDER ITEMS

        const sheetItems =
            await this.traysRepository
                .getSheetItems(
                    sheet.id,
                );

        // PRODUCT TRAY RULES

        const trayRules =
            await this.traysRepository
                .getProductTrayRules();

        // TRAY TYPES

        const trayTypes =
            await this.traysRepository
                .getTrayTypes();

        // SAVED CLIENT TRAY DATA

        const trayTransactions =
            await this.traysRepository
                .getTrayTransactions(
                    sheet.id,
                );

        // GATEPASS DATA
        const openingBalanceMap =
            new Map<string, number>();

        for (const client of clients) {

            for (const trayType of trayTypes) {

                const openingBalance =
                    await this.traysRepository
                        .getPreviousClosingBalance({

                            currentSheetId:
                                sheet.id,

                            groupId:
                                sheet.group_id,

                            clientId:
                                client.id,

                            trayTypeId:
                                trayType.id,

                            paperDate:
                                sheet.order_paper
                                    .order_date,
                        });

                openingBalanceMap.set(

                    `${client.id}_${trayType.id}`,

                    openingBalance,
                );
            }
        }

        const trayBilling =
            await this.trayBillingBuilder
                .buildTrayBilling({

                    clients,

                    trayTypes,

                    sheetItems,

                    trayRules,

                    trayTransactions,

                    openingBalanceMap,
                });

        return {

            sheet,

            trayBilling,
        };
    }





    // trays/trays.service.ts
    async saveTrayEntriesService(
        sheetId: number,
        entries: SaveTrayReturnDto[],  // ← Updated type
    ) {
        const sheet = await this.traysRepository
            .findSheetById(sheetId);

        

        if (!sheet) {
            throw new NotFoundException(
                TRAY_ERROR_MESSAGES
                    .SHEET_NOT_FOUND,
            );
        }

        const status =
    await this.traysRepository
        .getPaperStatusBySheetId(
            sheetId,
        );

if (
    !this.workflowStateService
        .canEditTrays(status as any)
) {
    throw new BadRequestException(
        'Tray entries cannot be edited in current workflow state',
    );
}
        // BUILD LIVE TRAY DATA
        const traySheet = await this.getTraySheetService(sheetId);
        const trayRows = traySheet.trayBilling.rows;

        for (const entry of entries) {
            const returned = Number(entry.returned ?? 0);

            if (returned < 0) {
                throw new BadRequestException(
                    TRAY_ERROR_MESSAGES
                        .NEGATIVE_RETURNED_TRAYS
                );
            }

            // FIND LIVE DERIVED ROW

            const trayRow =
                trayRows.find(
                    row =>
                        row.clientId ===
                        entry.clientId,
                );



            if (!trayRow) {
                throw new BadRequestException(
                    TRAY_ERROR_MESSAGES
                        .TRAY_ROW_NOT_FOUND(
                            entry.clientId,
                        )
                );
            }

            // ✓ GET CALCULATED VALUES FROM DERIVED ROW
            const opening =
                Number(
                    trayRow[
                    `tray_${entry.trayTypeId}_opening`
                    ] ?? 0,
                );

            const taken =
                Number(
                    trayRow[
                    `tray_${entry.trayTypeId}_taken`
                    ] ?? 0,
                );


            // VALIDATION: Can't return more than available


            const closing =
                opening +
                taken -
                returned;
            // ✓ PERSIST ONLY THE RETURNED VALUE
            // Opening and taken are derived, not stored
            await this.traysRepository
                .upsertTrayTransaction({
                    order_sheet_id: sheetId,
                    client_id: entry.clientId,
                    tray_type_id: entry.trayTypeId,
                    opening_balance: opening,     // From calculation
                    trays_returned: returned,     // From input
                    trays_taken: taken,
                    closing_balance: closing          // From calculation (optional)
                });
        }

        return {
            success: true,
            message:
                TRAY_SUCCESS_MESSAGES
                    .TRAY_RETURNS_SAVED
        };
    }
}