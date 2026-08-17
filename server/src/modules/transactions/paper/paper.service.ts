import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DATE_CONFIG, ERROR_MESSAGES } from './paper.constants.js';
import { PaperValidationService } from './services/paper-validation.service.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { PaperRepository } from './paper.repository.js';
import { OrderPaperStatus } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DependencyOrchestratorService } from '../dependencies/dependency-orchestrator.service.js';
import {
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
} from '../dependencies/dependency.constant.js';

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);
  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly paperValidationService: PaperValidationService,
    private readonly workflowState: WorkflowStateService,
    private readonly prisma: PrismaService,
    private readonly dependencyOrchestrator: DependencyOrchestratorService,
  ) {}

  async generatePaperService(date: string) {
    if (!date) {
      throw new BadRequestException(
        ERROR_MESSAGES.MISSING_REQUIRED_FIELD('date'),
      );
    }

    const [year, month, day] = date.split('-').map(Number);

    if (!year || !month || !day) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT);
    }

    const saleDate = new Date(Date.UTC(year, month - 1, day));
    const orderDate = new Date(saleDate);
    orderDate.setUTCDate(orderDate.getUTCDate() - 1);

    const tomorrowSale = new Date(saleDate);
    tomorrowSale.setUTCDate(tomorrowSale.getUTCDate() + 1);

    const now = new Date();

    const istDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: DATE_CONFIG.TIMEZONE,
    }).format(now); // YYYY-MM-DD

    const [istYear, istMonth, istDay] = istDate.split('-').map(Number);

    const todayIst = new Date(Date.UTC(istYear, istMonth - 1, istDay));

    if (saleDate < todayIst) {
      throw new BadRequestException(ERROR_MESSAGES.PAST_DATE_NOT_ALLOWED);
    }

    const thirtyDaysAhead = new Date(todayIst);

    thirtyDaysAhead.setUTCDate(
      thirtyDaysAhead.getUTCDate() + DATE_CONFIG.MAX_FUTURE_DAYS,
    );

    if (saleDate > thirtyDaysAhead) {
      throw new BadRequestException(
        ERROR_MESSAGES.FUTURE_DATE_TOO_FAR(DATE_CONFIG.MAX_FUTURE_DAYS),
      );
    }

    const existingPaper = await this.paperRepository.findPaperBySaleDate(
      saleDate,
      tomorrowSale,
    );

    if (existingPaper) {
      return existingPaper;
    }

    return this.prisma.$transaction(async (tx) => {
      const paper = await this.paperRepository.generatePaperFromOrderDate(
        orderDate,
        tx,
      );

      const groups = await this.paperRepository.getActiveGroups(tx);

      if (!groups || groups.length === 0) {
        throw new BadRequestException(ERROR_MESSAGES.NO_ACTIVE_GROUPS);
      }

      await this.paperRepository.generateOrderSheets(paper.id, groups, tx);

      return paper;
    });
  }

  async getTodayPaperService() {
    try {
      this.logger.log('Fetching today or latest paper');

      const now = new Date();

      const istDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: DATE_CONFIG.TIMEZONE,
      }).format(now); // YYYY-MM-DD

      const [year, month, day] = istDate.split('-').map(Number);

      const today = new Date(Date.UTC(year, month - 1, day));

      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

      const todayPaper = await this.paperRepository.findPaperBySaleDate(
        today,
        tomorrow,
      );

      if (todayPaper) {
        return {
          type: 'TODAY',

          paper: todayPaper,
        };
      }

      const latestPaper = await this.paperRepository.findLatestPaper();

      if (!latestPaper) {
        throw new BadRequestException(ERROR_MESSAGES.NO_PAPERS_FOUND);
      }

      return {
        type: 'LATEST',

        paper: latestPaper,
      };
    } catch (error) {
      this.logger.error('Failed to fetch today/latest paper', error);

      throw error;
    }
  }

  async getPaperByIdService(paperId: number) {
    const paper = await this.paperRepository.findPaperById(paperId);

    if (!paper) {
      throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
    }

    return paper;
  }

  async getPapersService(date?: string) {
    if (date) {
      const [year, month, day] = date.split('-').map(Number);

      if (!year || !month || !day) {
        throw new BadRequestException(ERROR_MESSAGES.INVALID_DATE_FORMAT);
      }

      const start = new Date(Date.UTC(year, month - 1, day));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);

      const paper = await this.paperRepository.findPaperBySaleDate(start, end);

      if (!paper) {
        throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      return paper;
    }

    return this.paperRepository.findAllPapers();
  }

  async submitNightEntryService(paperId: number) {
    return this.prisma.$transaction(async (tx) => {
      const paper =
        await this.paperValidationService.validateNightSubmitReadiness(
          paperId,
          tx,
        );

      this.workflowState.validateTransition(
        paper.status,
        OrderPaperStatus.NIGHT_SUBMITTED,
      );

      return this.paperRepository.submitNightEntry(paperId, tx);
    });
  }

  async submitMorningEntryService(paperId: number) {
    return this.prisma.$transaction(async (tx) => {
      const paper =
        await this.paperValidationService.validateMorningSubmitReadiness(
          paperId,
          tx,
        );

      this.workflowState.validateTransition(
        paper.status,
        OrderPaperStatus.MORNING_SUBMITTED,
      );

      return this.paperRepository.submitMorningEntry(paperId, tx);
    });
  }

  async finalizePaperService(paperId: number) {
    return this.prisma.$transaction(async (tx) => {
      const paper = await this.paperValidationService.validateFinalizeReadiness(
        paperId,
        tx,
      );

      this.workflowState.validateTransition(
        paper.status,
        OrderPaperStatus.FINALIZED,
      );

      await this.dependencyOrchestrator.execute(
        DEPENDENCY_MODULES.PAPER,
        DEPENDENCY_TRIGGERS.ON_FINALIZE,
        {
          paperId,
          tx,
        },
      );

      return this.paperRepository.finalizePaper(paperId, tx);
    });
  }

  async reopenPaperService(paperId: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const paper = await this.paperRepository.findPaperById(paperId, tx);

      if (!paper) {
        throw new BadRequestException(ERROR_MESSAGES.PAPER_NOT_FOUND);
      }

      this.workflowState.validateTransition(
        paper.status,
        OrderPaperStatus.REOPENED,
      );

      return this.paperRepository.reopenPaper(paperId, reason, tx);
    });
  }
}
