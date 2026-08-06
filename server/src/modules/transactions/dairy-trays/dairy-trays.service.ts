import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DairyTraysValidationService } from './services/dairy-trays-validation.service.js';
import { DairyTraysBuilder } from './dairy-trays.builder.js';
import { DairyTraysRepository } from './dairy-trays.repository.js';
import { WorkflowStateService } from '../workflow/workflow-state.service.js';
import { SaveDairyTrayEntriesDto } from './dto/save-dairy-tray-entries.dto.js';
import { WorkflowBuilder } from '../workflow/workflow.builder.js';

@Injectable()
export class DairyTraysService {
  constructor(
    private readonly dairyTraysRepository: DairyTraysRepository,
    private readonly dairytraysBuilder: DairyTraysBuilder,
    private readonly dairytraysValidationService: DairyTraysValidationService,
    private readonly workflowStateService: WorkflowStateService,
    private readonly workflowBuilder: WorkflowBuilder,
  ) {}

  async getDairyTrayGrid(paperId: number) {
    const paper = await this.dairyTraysRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Paper not found');
    }

    if (!this.workflowStateService.canEditDairyTrays(paper.status)) {
      throw new BadRequestException(
        'Dairy trays cannot be edited in the current workflow state',
      );
    }

    const dairyTrayPaper =
      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paperId);

    const [vehicles, trayTypes, trayRules, purchaseEntries] = await Promise.all(
      [
        this.dairyTraysRepository.getVehicles(),
        this.dairyTraysRepository.getTrayTypes(),
        this.dairyTraysRepository.getProductTrayRules(),
        this.dairyTraysRepository.getPurchaseEntries(paperId),
      ],
    );

    let previousTransactions: Awaited<
      ReturnType<DairyTraysRepository['getPreviousTrayBalances']>
    > = [];

    const previousPaper = await this.dairyTraysRepository.getPreviousPaper(
      paper.id,
      paper.sale_date,
    );

    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
        );

      if (previousDairyTrayPaper) {
        previousTransactions =
          await this.dairyTraysRepository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
          );
      }
    }

    const currentTransactions =
      await this.dairyTraysRepository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
      );

    const workflow = this.workflowBuilder.buildDairyTrayTrackingWorkflow(
      paper.status,
    );

    const grid = this.dairytraysBuilder.buildDairyTrayGrid({
      vehicles,
      trayTypes,
      purchaseEntries,
      trayRules,
      previousTransactions,
      currentTransactions,
    });

    return {
      paper,
      workflow,
      ...grid,
    };
  }

  async saveDairyTrayEntries(paperId: number, dto: SaveDairyTrayEntriesDto) {
    const paper = await this.dairyTraysRepository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Paper not found');
    }

    if (!this.workflowStateService.canEditDairyTrays(paper.status)) {
      throw new BadRequestException(
        'Dairy tray cannot be edited in the current workflow state',
      );
    }

    const dairyTrayPaper =
      await this.dairyTraysRepository.getOrCreateDairyTrayPaper(paperId);

    const [vehicles, trayTypes, purchaseEntries, trayRules] = await Promise.all(
      [
        this.dairyTraysRepository.getVehicles(),
        this.dairyTraysRepository.getTrayTypes(),
        this.dairyTraysRepository.getPurchaseEntries(paperId),
        this.dairyTraysRepository.getProductTrayRules(),
      ],
    );

    this.dairytraysValidationService.validateSaveRequest(
      dto.entries,
      vehicles,
      trayTypes,
    );

    let previousTransactions: Awaited<
      ReturnType<DairyTraysRepository['getPreviousTrayBalances']>
    > = [];

    const previousPaper = await this.dairyTraysRepository.getPreviousPaper(
      paper.id,
      paper.sale_date,
    );

    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.dairyTraysRepository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
        );

      if (previousDairyTrayPaper) {
        previousTransactions =
          await this.dairyTraysRepository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
          );
      }
    }

    const transactions = this.dairytraysBuilder.buildTrayTransactions(
      dairyTrayPaper.id,
      dto.entries,
      purchaseEntries,
      trayRules,
      previousTransactions,
    );

    await this.dairyTraysRepository.replaceTrayTransactions(
      dairyTrayPaper.id,
      transactions,
    );

    return this.getDairyTrayGrid(paperId);
  }
}
