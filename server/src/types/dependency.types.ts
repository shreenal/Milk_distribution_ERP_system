import { DeliverySession } from '../generated/prisma/client.js';

export enum DependencyType {
  PROPAGATION = 'PROPAGATION',
  CONSUMPTION = 'CONSUMPTION',
  VALIDATION = 'VALIDATION',
  AGGREGATION = 'AGGREGATION',
  WORKFLOW = 'WORKFLOW',
}

export enum DependencyTrigger {
  SAVE = 'SAVE',
  SUBMIT = 'SUBMIT',
  FINALIZE = 'FINALIZE',
  REOPEN = 'REOPEN',
}

export interface DependencyDefinition {
  id: string;

  sourceModule: string;

  targetModule: string;

  type: DependencyType;

  trigger: DependencyTrigger;

  sessionAware: boolean;

  description: string;
}

export interface DependencyContext {
  paperId: number;

  session?: DeliverySession;

  trigger: DependencyTrigger;
}
