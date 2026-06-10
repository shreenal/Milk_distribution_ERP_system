    import { BadRequestException, Injectable, Logger } from '@nestjs/common';
    import { DATE_CONFIG, ERROR_MESSAGES, PAPER_STATUS, PaperStatus } from './paper.constants.js';
    import { PaperValidationService } from './paper-validation.service.js';
    import { WorkflowStateService } from '../workflow/workflow-state.service.js';
    import { PaperRepository } from './paper.repository.js';

    @Injectable()
    export class PaperService {


        private readonly logger =
            new Logger(PaperService.name);
        constructor(
            private readonly paperRepository:PaperRepository,
            private readonly paperValidationService:PaperValidationService,
            private readonly workflowState: WorkflowStateService,
        ) { }


        async generatePaperService(
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
                    await this.paperRepository
                        .findOrderPaper(
                            dateOnly,
                            tomorrow,
                        );

                if (existingPaper) {

                    return existingPaper;
                }

                const paper =
                    await this.paperRepository
                        .generateOrderPaper(
                            dateOnly,
                        );

                const groups =
                    await this.paperRepository
                        .getActiveGroups();

                if (
                    !groups ||
                    groups.length === 0
                ) {

                    throw new BadRequestException(
                        ERROR_MESSAGES.NO_ACTIVE_GROUPS,
                    );
                }

                await this.paperRepository
                    .generateOrderSheets(
                        paper.id,
                        groups,
                    );

                return paper;

            } catch (error) {

                this.logger.error(
                    'Failed to generate paper',
                    error,
                );

                throw error;
            }
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

                const todayPaper =
                    await this.paperRepository
                        .findTodayPaper(
                            today,
                            tomorrow,
                        );

                if (todayPaper) {

                    return {

                        type: 'TODAY',

                        paper: todayPaper,
                    };
                }

                const latestPaper =
                    await this.paperRepository
                        .findLatestPaper();

                if (!latestPaper) {

                    throw new BadRequestException(
                        ERROR_MESSAGES.NO_PAPERS_FOUND,
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


        async submitNightEntryService(
            paperId: number,
        ) {

            const paper =
                await this.paperValidationService
                    .validateNightSubmitReadiness(
                        paperId,
                    );

            this.workflowState.validateTransition(
                paper.status as PaperStatus,
                PAPER_STATUS.NIGHT_SUBMITTED,
            );

            return this.paperRepository
                .submitNightEntry(
                    paperId,
                );
        }

        async submitMorningEntryService(
            paperId: number,
        ) {

            const paper =
                await this.paperValidationService
                    .validateMorningSubmitReadiness(
                        paperId,
                    );

            this.workflowState.validateTransition(
                paper.status as PaperStatus,
                PAPER_STATUS.MORNING_SUBMITTED,
            );

            return this.paperRepository
                .submitMorningEntry(
                    paperId,
                );
        }

        async finalizePaperService(
            paperId: number,
        ) {

            const paper =
                await this.paperValidationService
                    .validateFinalizeReadiness(
                        paperId,
                    );

            this.workflowState.validateTransition(
                paper.status as PaperStatus,
                PAPER_STATUS.FINALIZED,
            );

            return this.paperRepository
                .finalizePaper(
                    paperId,
                );
        }


        async reopenPaperService(
            paperId: number,
            reason: string,
        ) {

            const paper =
                await this.paperRepository
                    .findPaperById(
                        paperId,
                    );

            if (!paper) {

                throw new BadRequestException(
                    ERROR_MESSAGES.PAPER_NOT_FOUND,
                );
            }

            this.workflowState.validateTransition(
                paper.status as PaperStatus,
                PAPER_STATUS.REOPENED,
            );

            return this.paperRepository
                .reopenPaper(
                    paperId,
                    reason,
                );
        }
    }