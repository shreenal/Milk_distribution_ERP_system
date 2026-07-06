import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DairyTrayTrackingValidationService } from "./dairy-tray-tracking-validation.service.js";
import { DairyTrayTrackingBuilder } from "./dairy-tray-tracking.builder.js";
import { DairyTrayTrackingRepository } from "./dairy-tray-tracking.repository.js";
import { WorkflowStateService } from "../workflow/workflow-state.service.js";
import { SaveDairyTrayEntriesDto } from "./dto/save-dairy-tray-entries.dto.js";

@Injectable()
export class DairyTrayTrackingService {
  constructor(
    private readonly repository: DairyTrayTrackingRepository,
    private readonly builder: DairyTrayTrackingBuilder,
    private readonly validation: DairyTrayTrackingValidationService,
    private readonly workflowStateService: WorkflowStateService,
  ) { }

  async getDairyTrayGrid(paperId: number) {
    const paper = await this.repository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Paper not found');
    }

    if (
      !this.workflowStateService.canEditDairyTrayTracking(
        paper.status,
      )
    ) {
      throw new BadRequestException(
        'Dairy tray tracking cannot be edited in the current workflow state',
      );
    }

    const dairyTrayPaper =
      await this.repository.getOrCreateDairyTrayPaper(paperId);

    const [
      vehicles,
      trayTypes,
      trayRules,
      vehicleAllocations,
    ] = await Promise.all([
      this.repository.getVehicles(),
      this.repository.getTrayTypes(),
      this.repository.getProductTrayRules(),
      this.repository.getVehicleAllocations(paperId),
    ]);

    let previousTransactions: Awaited<
      ReturnType<DairyTrayTrackingRepository['getPreviousTrayBalances']>
    > = [];

    const previousPaper =
      await this.repository.getPreviousPaper(
        paper.id,
        paper.sale_date,
      );

    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.repository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
        );

      if (previousDairyTrayPaper) {
        previousTransactions = await this.repository.getPreviousTrayBalances(previousDairyTrayPaper.id);
      }
    }

    const currentTransactions =
      await this.repository.getCurrentTrayTransactions(
        dairyTrayPaper.id,
      );

    return this.builder.buildDairyTrayGrid({
      vehicles,
      trayTypes,
      vehicleAllocations,
      trayRules,
      previousTransactions,
      currentTransactions,
    });
  }

  async saveDairyTrayEntries(
    paperId: number,
    dto: SaveDairyTrayEntriesDto,
  ) {
    const paper = await this.repository.findPaperById(paperId);

    if (!paper) {
      throw new NotFoundException('Paper not found');
    }

    if (
      !this.workflowStateService.canEditDairyTrayTracking(
        paper.status,
      )
    ) {
      throw new BadRequestException(
        'Dairy tray tracking cannot be edited in the current workflow state',
      );
    }

    const dairyTrayPaper =
      await this.repository.getOrCreateDairyTrayPaper(paperId);

    const [
      vehicles,
      trayTypes,
      vehicleAllocations,
      trayRules,
    ] = await Promise.all([
      this.repository.getVehicles(),
      this.repository.getTrayTypes(),
      this.repository.getVehicleAllocations(paperId),
      this.repository.getProductTrayRules(),
    ]);

    this.validation.validateSaveRequest(
      dto.entries,
      vehicles,
      trayTypes,
    );

    let previousTransactions: Awaited<
      ReturnType<DairyTrayTrackingRepository['getPreviousTrayBalances']>
    > = [];

    const previousPaper = await this.repository.getPreviousPaper(
      paper.id,
      paper.sale_date,
    );

    if (previousPaper) {
      const previousDairyTrayPaper =
        await this.repository.findDairyTrayPaperByOrderPaperId(
          previousPaper.id,
        );

      if (previousDairyTrayPaper) {
        previousTransactions =
          await this.repository.getPreviousTrayBalances(
            previousDairyTrayPaper.id,
          );
      }
    }

    const transactions = this.builder.buildTrayTransactions(
      dairyTrayPaper.id,
      dto.entries,
      vehicleAllocations,
      trayRules,
      previousTransactions,
    );

    await this.repository.replaceTrayTransactions(
      dairyTrayPaper.id,
      transactions,
    );

    return this.getDairyTrayGrid(paperId);
  }
}