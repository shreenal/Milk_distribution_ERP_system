import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';

import { OrdersRepository }
    from './orders.repository.js';

import { SaveMorningEntriesDto }
    from './dto/save-morning-entries.dto.js';

import { SaveNightEntriesDto }
    from './dto/save-night-entries.dto.js';

import { OrdersBillingBuilder }
    from './order.billing-builder.js';




import { TraysService } from '../trays/trays.service.js';


import { TraysValidationService } from '../trays/trays-validation.service.js';

import { CollectionsValidationService } from '../collections/collections-validation.service.js';

import { OrdersValidationService } from './orders-validation.service.js';

import {
    TRANSACTION_CONFIG, PAPER_STATUS, DATE_CONFIG, type PaperStatus, STATUS_TRANSITIONS,

    ERROR_MESSAGES, EDITABLE_STATUSES,
    QUANTITY_PRECISION,
    SUCCESS_MESSAGES
}
    from './orders.constants.js';

import { PrismaService } from '../../prisma/prisma.service.js';
// import { TrayGatepassRepository } from '../tray-gatepass/tray-gatepass.repository.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { CollectionsService } from '../collections/collections.service.js';

@Injectable()
export class OrdersService {


    private readonly logger =
        new Logger(OrdersService.name);

    constructor(

        private readonly ordersRepository:
            OrdersRepository,

        private readonly ordersBillingBuilder:
            OrdersBillingBuilder,

        private readonly validationService:
            OrdersValidationService,

        private readonly traysService:
            TraysService,

        private readonly trayValidationService:
            TraysValidationService,

        private readonly prisma:
            PrismaService,

        private readonly collectionsService:
            CollectionsService,

        private readonly collectionsValidationService:
            CollectionsValidationService,

        private readonly workflowState: WorkflowStateService,

    ) { }

    private isMorningEditable(
        status: PaperStatus,
    ) {

        return (
            EDITABLE_STATUSES
                .MORNING_EDITABLE as
            readonly PaperStatus[]
        ).includes(status);
    }



    async getTodayPaperService() {

        try {

            this.logger.log(
                'Fetching today or latest paper',
            );

            const today = new Date();

            today.setHours(
                0,
                0,
                0,
                0,
            );

            const tomorrow =
                new Date(today);

            tomorrow.setDate(
                tomorrow.getDate() + 1,
            );

            this.logger.log(today);
            this.logger.log(tomorrow);
            const todayPaper =
                await this.ordersRepository
                    .findTodayPaper(
                        today,
                        tomorrow,
                    );

            this.logger.log(
                JSON.stringify(todayPaper),
            );

            if (todayPaper) {

                return {

                    type: 'TODAY',

                    paper: todayPaper,
                };
            }

            const latestPaper =
                await this.ordersRepository
                    .findLatestPaper();

            if (!latestPaper) {

                throw new BadRequestException(
                    'No papers found in system',
                );
            }

            return {

                type: 'LATEST',

                paper: latestPaper,
            };

        } catch (error) {

            this.logger.error(
                'Failed to fetch today/latest paper',
                error,
            );

            throw error;
        }
    }

    async generateOrderPaperService(
        date: string,
    ) {

        try {

            if (!date) {

                throw new BadRequestException(
                    ERROR_MESSAGES.MISSING_REQUIRED_FIELD(
                        'date',
                    ),
                );
            }

            const [
                year,
                month,
                day,
            ] = date
                .split('-')
                .map(Number);

            if (
                !year ||
                !month ||
                !day
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.INVALID_DATE_FORMAT,
                );
            }

            const dateOnly =
                new Date(
                    Date.UTC(
                        year,
                        month - 1,
                        day,
                    ),
                );

            const today =
                new Date();

            const todayUtc =
                new Date(
                    Date.UTC(
                        today.getUTCFullYear(),
                        today.getUTCMonth(),
                        today.getUTCDate(),
                    ),
                );

            if (
                dateOnly < todayUtc
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.PAST_DATE_NOT_ALLOWED,
                );
            }

            const thirtyDaysAhead =
                new Date(todayUtc);

            thirtyDaysAhead.setUTCDate(
                thirtyDaysAhead.getUTCDate() +
                DATE_CONFIG.MAX_FUTURE_DAYS,
            );

            if (
                dateOnly > thirtyDaysAhead
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.FUTURE_DATE_TOO_FAR(
                        DATE_CONFIG.MAX_FUTURE_DAYS,
                    ),
                );
            }

            const tomorrow =
                new Date(dateOnly);

            tomorrow.setUTCDate(
                tomorrow.getUTCDate() + 1,
            );

            const existingPaper =
                await this.ordersRepository
                    .findOrderPaper(
                        dateOnly,
                        tomorrow,
                    );

            if (existingPaper) {

                return existingPaper;
            }

            const paper =
                await this.ordersRepository
                    .generateOrderPaper(
                        dateOnly,
                    );

            const groups =
                await this.ordersRepository
                    .getActiveGroups();

            if (
                !groups ||
                groups.length === 0
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.NO_ACTIVE_GROUPS,
                );
            }

            await this.ordersRepository
                .generateOrderSheets(
                    paper.id,
                    groups,
                );

            return paper;

        } catch (error) {

            this.logger.error(
                'Failed to generate order paper',
                error,
            );

            throw error;
        }
    }

    async getSheetService(
        sheetId: number,
    ) {

        try {

            if (
                !sheetId ||
                sheetId <= 0
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.INVALID_SHEET_ID
                );
            }

            const sheet =
                await this.ordersRepository
                    .findSheetById(
                        sheetId,
                    );

            if (!sheet) {

                throw new BadRequestException(
                    ERROR_MESSAGES.SHEET_NOT_FOUND
                );
            }

            const orderBilling =
                await this.ordersBillingBuilder
                    .buildOrderBillingSection(
                        sheet,
                    );

            const traySheet =
                await this.traysService
                    .getTraySheetService(
                        sheetId,
                    );

            const collectionGrid =
                await this.collectionsService
                    .getCollectionGrid(
                        sheetId,
                    );

            return {

                sheet,

                workflow: {

                    status:
                        sheet.order_paper.status,

                    isNightEditable:

                        (
                            EDITABLE_STATUSES
                                .NIGHT_EDITABLE as
                            readonly PaperStatus[]
                        ).includes(
                            sheet.order_paper.status as PaperStatus,
                        ),

                    isMorningEditable:

                        this.isMorningEditable(
                            sheet.order_paper.status as PaperStatus,
                        ),
                },

                milkGrid:
                    orderBilling.milkGrid,

                nonMilkGrid:
                    orderBilling.nonMilkGrid,

                trayBilling:
                    traySheet.trayBilling,

                collectionBilling:
                    collectionGrid,
            };

        } catch (error) {

            this.logger.error(
                `Failed to fetch sheet ${sheetId}`,
                error,
            );

            throw error;
        }
    }

    async getSheetItemsService(
        sheetId: number,
    ) {

        try {

            if (
                !sheetId ||
                sheetId <= 0
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES.INVALID_SHEET_ID
                );
            }

            return await this.ordersRepository
                .getSheetItems(
                    sheetId,
                );

        } catch (error) {

            this.logger.error(
                ERROR_MESSAGES.SHEET_NOT_FOUND,
                error,
            );

            throw error;
        }
    }



    async saveNightEntriesService(
        sheetId: number,
        entries: SaveNightEntriesDto[],
    ) {

        try {

            if (
                !sheetId ||
                sheetId <= 0
            ) {

                throw new BadRequestException(
                    `Invalid sheet ID: ${sheetId}`,
                );
            }

            const sheet =
                await this.ordersRepository
                    .findSheetById(
                        sheetId,
                    );

            if (!sheet) {

                throw new BadRequestException(
                    `Sheet with ID ${sheetId} not found`,
                );
            }

            if (
                !(
                    EDITABLE_STATUSES
                        .NIGHT_EDITABLE as readonly PaperStatus[]
                )
                    .includes(
                        sheet.order_paper.status as PaperStatus,
                    )
            ) {

                throw new BadRequestException(

                    ERROR_MESSAGES
                        .CANNOT_EDIT_NIGHT(
                            sheet.order_paper.status,
                        ),
                );
            }

            this.validationService
                .validateNoDuplicates(
                    entries,
                );


            await this.prisma.$transaction(
                async (tx) => {

                    for (const entry of entries) {


                        await this.validationService
                            .validateClient(

                                entry.clientId,
                                tx,
                            );

                        await this.validationService
                            .validateClientInGroup(

                                entry.clientId,
                                sheet.group_id,
                                tx,
                            );

                        await this.validationService
                            .validateProduct(

                                entry.productId,
                                tx,
                            );




                        if (
                            entry.orderedQty === undefined ||
                            entry.orderedQty === null
                        ) {

                            throw new BadRequestException(
                                ERROR_MESSAGES.MISSING_REQUIRED_FIELD('orderedQty',)
                            );
                        }

                        this.validationService
                            .validateQuantity(
                                Number(
                                    entry.orderedQty,
                                ),
                            );


                        const sellingRate =
                            await this.ordersRepository
                                .getSellingRate(
                                    entry.clientId,
                                    entry.productId,
                                    sheet.order_paper.order_date, // ← FIXED
                                );

                        console.log(`[DEBUG] Client ${entry.clientId}, Product ${entry.productId}, Rate: ${sellingRate}`);


                        if (
                            sellingRate === null ||
                            sellingRate === undefined
                        ) {

                            throw new BadRequestException(

                                ERROR_MESSAGES
                                    .NO_APPLICABLE_RATE(
                                        entry.productId,
                                        sheet.order_paper.order_date.toISOString(),
                                    ),
                            );
                        }
                        const litres =

                            Number(entry.orderedQty) *
                            QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

                        const nightBillAmount =

                            litres *
                            Number(sellingRate);


                        await this.ordersRepository
                            .upsertSheetEntryTx(
                                tx,
                                {
                                    order_sheet_id:
                                        sheetId,

                                    client_id:
                                        entry.clientId,

                                    product_id:
                                        entry.productId,

                                    ordered_qty:
                                        entry.orderedQty,

                                    night_selling_rate:
                                        Number(sellingRate),

                                    night_bill_amount:
                                        Number(
                                            nightBillAmount.toFixed(2),
                                        ),
                                },
                            );
                    }
                },
                {
                    timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
                    isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,

                },
            );

            return {
                success: true,

                message:
                    SUCCESS_MESSAGES
                        .NIGHT_ENTRIES_SAVED,
            };

        } catch (error) {

            this.logger.error(
                `Failed to save night entries for sheet ${sheetId}`,
                error,
            );

            throw error;
        }
    }

    async saveMorningEntriesService(
        sheetId: number,
        entries: SaveMorningEntriesDto[],
    ) {

        try {

            if (
                !sheetId ||
                sheetId <= 0
            ) {

                throw new BadRequestException(
                    `Invalid sheet ID: ${sheetId}`,
                );
            }

            const sheet =
                await this.ordersRepository
                    .findSheetById(
                        sheetId,
                    );

            if (!sheet) {

                throw new BadRequestException(
                    `Sheet with ID ${sheetId} not found`,
                );
            }


            console.log(
                '[DEBUG] PAPER STATUS:',
                sheet.order_paper.status,
            );



            const status =
                sheet.order_paper.status as PaperStatus;

            if (
                status === PAPER_STATUS.DRAFT
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES
                        .CANNOT_EDIT_MORNING(
                            status,
                        )
                );
            }

            if (
                status === PAPER_STATUS.MORNING_SUBMITTED
            ) {

                throw new BadRequestException(
                    'Morning entry already submitted',
                );
            }

            if (
                status === PAPER_STATUS.FINALIZED
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES
                        .CANNOT_EDIT_MORNING(
                            status,
                        )
                );
            }

            if (
                !this.isMorningEditable(
                    status,
                )
            ) {

                throw new BadRequestException(
                    ERROR_MESSAGES
                        .CANNOT_EDIT_MORNING(
                            status,
                        )
                );
            }




            this.validationService
                .validateNoDuplicates(
                    entries,
                );

            // CRITICAL FIX: Wrap all operations in a transaction
            // All morning entry operations must be atomic
            await this.prisma.$transaction(
                async (tx) => {

                    for (const entry of entries) {

                        if (
                            entry.deliveredQty === undefined ||
                            entry.deliveredQty === null
                        ) {

                            throw new BadRequestException(
                                ERROR_MESSAGES
                                    .MISSING_REQUIRED_FIELD(
                                        'deliveredQty',
                                    )
                            );
                        }

                        const deliveredQty =
                            Number(
                                entry.deliveredQty,
                            );

                        this.validationService
                            .validateQuantity(
                                deliveredQty,
                            );

                        await this.validationService
                            .validateClient(

                                entry.clientId,
                                tx,
                            );

                        await this.validationService
                            .validateClientInGroup(

                                entry.clientId,
                                sheet.group_id,
                                tx,
                            );

                        await this.validationService
                            .validateProduct(

                                entry.productId,
                                tx,
                            );

                        const existingItem =
                            await tx
                                .order_sheet_items
                                .findUnique({

                                    where: {

                                        order_sheet_id_client_id_product_id: {

                                            order_sheet_id:
                                                sheetId,

                                            client_id:
                                                entry.clientId,

                                            product_id:
                                                entry.productId,
                                        },
                                    },

                                    include: {

                                        master_product: true,
                                    },
                                });

                        if (!existingItem) {

                            throw new BadRequestException(
                                ERROR_MESSAGES
                                    .NO_ORDERED_QUANTITY(
                                        entry.clientId,
                                        entry.productId,
                                    )
                            );
                        }



                        const product =
                            existingItem.master_product;

                        // CRITICAL FIX: Use order_date for historical accuracy
                        const sellingRate =
                            await this.ordersRepository
                                .getSellingRate(
                                    entry.clientId,
                                    entry.productId,
                                    sheet.order_paper.order_date, // ← FIXED
                                );

                        if (
                            sellingRate === null ||
                            sellingRate === undefined
                        ) {

                            throw new BadRequestException(

                                `No rate configured for client ${entry.clientId} product ${entry.productId}`,
                            );
                        }

                        const litres = deliveredQty * QUANTITY_PRECISION.OPERATIONAL_UNIT_LITRES;

                        const gstPercentage =
                            Number(
                                product.gst_percentage ?? 0,
                            );

                        const isGstInclusive =
                            product.is_gst_inclusive;

                        let taxableAmount = 0;

                        let gstAmount = 0;

                        let finalBillAmount = 0;

                        if (!isGstInclusive) {

                            taxableAmount =
                                litres *
                                Number(sellingRate);

                            gstAmount =
                                taxableAmount *
                                (gstPercentage / 100);

                            finalBillAmount =
                                taxableAmount +
                                gstAmount;

                        } else {

                            finalBillAmount =
                                litres *
                                Number(sellingRate);

                            taxableAmount =
                                finalBillAmount /
                                (
                                    1 +
                                    (gstPercentage / 100)
                                );

                            gstAmount =
                                finalBillAmount -
                                taxableAmount;
                        }

                        taxableAmount =
                            Number(
                                taxableAmount.toFixed(2),
                            );

                        gstAmount =
                            Number(
                                gstAmount.toFixed(2),
                            );

                        finalBillAmount =
                            Number(
                                finalBillAmount.toFixed(2),
                            );

                        // Use tx instead of this.ordersRepository
                        await tx
                            .order_sheet_items
                            .update({

                                where: {

                                    order_sheet_id_client_id_product_id: {

                                        order_sheet_id:
                                            sheetId,

                                        client_id:
                                            entry.clientId,

                                        product_id:
                                            entry.productId,
                                    },
                                },

                                data: {

                                    delivered_qty:
                                        deliveredQty,

                                    final_selling_rate:
                                        Number(sellingRate),

                                    final_gst_percentage:
                                        gstPercentage,

                                    final_gst_amount:
                                        gstAmount,

                                    final_taxable_amount:
                                        taxableAmount,

                                    final_bill_amount:
                                        finalBillAmount,
                                },
                            });
                    }
                },
                {
                    timeout: TRANSACTION_CONFIG.TIMEOUT_MS,
                    isolationLevel: TRANSACTION_CONFIG.ISOLATION_LEVEL,

                },
            );

            return {
                success: true,

                message: SUCCESS_MESSAGES.MORNING_ENTRIES_SAVED
            };

        } catch (error) {

            this.logger.error(
                `Failed to save morning entries for sheet ${sheetId}`,
                error,
            );

            throw error;
        }
    }

    async submitNightEntryService(paperId: number) {
        const paper = await this.ordersRepository.findPaperById(paperId);

        if (!paper) {
            throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
        }

        this.workflowState.validateTransition(
            paper.status as PaperStatus,
            'NIGHT_SUBMITTED',
        );

        const sheets = await this.ordersRepository.getPaperSheets(paperId);

        for (const sheet of sheets) {
            const entries = await this.ordersRepository.getSheetItems(sheet.id);

            if (entries.length === 0) {
                throw new BadRequestException(
                    `No orders entered for sheet "${sheet.master_group.name}". ` +
                    `Please enter at least one order before submitting.`
                );
            }

            const incompleteEntries = entries.filter(item => item.ordered_qty === null);

            if (incompleteEntries.length > 0) {
                throw new BadRequestException(
                    `Night entry incomplete for sheet "${sheet.master_group.name}"`
                );
            }



            const traySheet = await this.traysService.getTraySheetService(sheet.id);

            if (!traySheet.trayBilling || traySheet.trayBilling.rows.length === 0) {
                throw new BadRequestException(
                    `Tray calculation failed for sheet "${sheet.master_group.name}"`
                );
            }

            await this.collectionsValidationService
                .validateNightCollections(
                    sheet.id,
                );
        }

        return this.ordersRepository.submitNightEntry(paperId);
    }

    async submitMorningEntryService(paperId: number) {
        const paper = await this.ordersRepository.findPaperById(paperId);
        if (!paper) {
            throw new BadRequestException('Order paper not found');
        }

        this.workflowState.validateTransition(
            paper.status as PaperStatus,
            'MORNING_SUBMITTED',
        );

        const sheets = await this.ordersRepository.getPaperSheets(paperId);

        for (const sheet of sheets) {
            // Orders validation
            try {
                await this.validationService.validateMorningEntriesComplete(sheet.id);
                await this.validationService.validateQuantitySanity(sheet.id);
            } catch (error) {
                throw new BadRequestException(
                    error instanceof Error ? error.message : 'Orders validation failed'
                );
            }

            // Trays validation
            try {
                await this.trayValidationService.validateTrayCompleteness(sheet.id);
            } catch (error) {
                throw new BadRequestException(
                    error instanceof Error ? error.message : 'Trays validation failed'
                );
            }

            await this.collectionsValidationService
                .validateMorningCollections(
                    sheet.id,
                );
        }


        return await this.ordersRepository.submitMorningEntry(paperId);
    }

    async finalizePaperService(paperId: number) {
        const paper = await this.ordersRepository.findPaperById(paperId);

        if (!paper) {
            throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
        }

        const sheets =
            await this.ordersRepository
                .getPaperSheets(
                    paperId,
                );

        for (const sheet of sheets) {

            await this.collectionsValidationService
                .validateAdminCollections(
                    sheet.id,
                );
        }

        this.workflowState.validateTransition(
            paper.status as PaperStatus,
            'FINALIZED',
        );

        return this.ordersRepository.finalizePaper(paperId);
    }

    async reopenPaperService(paperId: number, reason: string) {
        const paper = await this.ordersRepository.findPaperById(paperId);

        if (!paper) {
            throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
        }

        this.workflowState.validateTransition(
            paper.status as PaperStatus,
            'REOPENED',
        );

        return this.ordersRepository.reopenPaper(paperId, reason);
    }
}