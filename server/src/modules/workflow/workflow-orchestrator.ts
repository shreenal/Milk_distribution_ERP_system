import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OrdersRepository } from '../orders/orders.repository.js';
import { OrdersValidationService } from '../orders/orders-validation.service.js';
import { TraysValidationService } from '../trays/trays-validation.service.js';
import { WorkflowStateService, type PaperStatus } from './workflow-state.service.js';

@Injectable()
export class WorkflowOrchestrator {
    
    private readonly logger = new Logger(WorkflowOrchestrator.name);
    
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly ordersValidation: OrdersValidationService,
        private readonly traysValidation: TraysValidationService,
        private readonly workflowState: WorkflowStateService,
    ) {}
    
}