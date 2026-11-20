import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

import { runSerializableTransaction } from './transaction-runner.js';
import type { TransactionSaveResult } from './save-result.js';

export type SaveChangePlan = {
  changed: boolean;
  write: () => Promise<void>;
};

export type TransactionSavePipeline<TContext, TResult> = {
  loadContext: (tx: Prisma.TransactionClient) => Promise<TContext>;
  plan: (
    context: TContext,
    tx: Prisma.TransactionClient,
  ) => Promise<SaveChangePlan>;
  currentToken: (context: TContext) => Date | null;
  advanceToken: (
    context: TContext,
    tx: Prisma.TransactionClient,
  ) => Promise<Date>;
  buildResponse: (
    context: TContext,
    result: TransactionSaveResult,
    tx: Prisma.TransactionClient,
  ) => Promise<TResult>;
};

// Use for "load -> plan a diff -> advance token -> write" saves (Collections,
// Cash Settlement). Derived-ledger and multi-operation saves call
// runSerializableTransaction directly.
export function runTransactionSave<TContext, TResult>(
  prisma: PrismaService,
  pipeline: TransactionSavePipeline<TContext, TResult>,
): Promise<TResult> {
  return runSerializableTransaction(prisma, async (tx) => {
    const context = await pipeline.loadContext(tx);
    const plan = await pipeline.plan(context, tx);

    let token = pipeline.currentToken(context);
    if (plan.changed) {
      token = await pipeline.advanceToken(context, tx);
      await plan.write();
    }

    const result: TransactionSaveResult = {
      success: true,
      changed: plan.changed,
      token: token?.toISOString() ?? null,
    };

    return pipeline.buildResponse(context, result, tx);
  });
}
