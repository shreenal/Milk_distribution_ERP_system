import { Module } from '@nestjs/common';
import { WorkflowStateService } from './workflow-state.service.js';

@Module({
  providers: [WorkflowStateService],
  exports: [WorkflowStateService],
})
export class WorkflowModule {}
