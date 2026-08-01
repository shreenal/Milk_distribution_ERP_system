import { Module } from '@nestjs/common';
import { WorkflowStateService } from './workflow-state.service.js';
import { WorkflowBuilder } from './workflow.builder.js';

@Module({
  providers: [WorkflowStateService, WorkflowBuilder],
  exports: [WorkflowStateService, WorkflowBuilder],
})
export class WorkflowModule {}
