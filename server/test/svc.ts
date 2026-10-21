import 'reflect-metadata';
import { vi } from 'vitest';
import { OrdersService } from '../src/modules/transactions/orders/orders.service.js';
import { OrdersValidationService } from '../src/modules/transactions/orders/services/orders-validation.service.js';
import { OrdersBuilder } from '../src/modules/transactions/orders/order.builder.js';
import { ProductColumnsBuilder } from '../src/common/builders/product-columns.builder.js';
import { WorkflowStateService } from '../src/modules/transactions/workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../src/modules/transactions/workflow/workflow.builder.js';
import { TrayCalculationService } from '../src/common/calculators/tray-calculation.service.js';

export function makeService(
  o: { status?: string; repo?: any; billing?: any; tx?: any } = {},
) {
  const sheetRow: any = {
    id: 1,
    group_id: 5,
    order_paper_id: 9,
    order_items_updated_at: null,
    order_morning_entry_saved_at: null,
    order_paper: {
      status: o.status ?? 'DRAFT',
      sale_date: new Date('2026-10-09T00:00:00Z'),
    },
  };
  const repo: any = {
    findSheetById: vi.fn(async () => sheetRow),
    touchOrderItemsIfUnchanged: vi.fn(async () => ({ count: 1 })),
    findSheetItemsByProductBatch: vi.fn(async () => new Map()),
    markOrderMorningEntrySaved: vi.fn(async () => ({})),
    getSheetItems: vi.fn(async () => []),
    getSheetProductLink: vi.fn(async () => null),
    getProductsForSheet: vi.fn(async () => []),
    getClientsForSheetDisplay: vi.fn(async () => []),
    ...(o.repo ?? {}),
  };
  const tx: any = o.tx ?? {
    master_client: { findMany: async () => [] },
    master_product: {
      findUnique: async () => ({ id: 1, is_active: true }),
      findMany: async () => [],
    },
    order_sheet_items: { findFirst: async () => null },
  };
  const prisma: any = { $transaction: async (fn: any) => fn(tx) };
  const tray = new TrayCalculationService({} as any);
  const validation = new OrdersValidationService(repo, tray);
  const billing: any = {
    getTrayRulesOnce: vi.fn(async () => []),
    saveNightEntriesBatch: vi.fn(async () => {}),
    saveMorningEntriesBatch: vi.fn(async () => {}),
    ...(o.billing ?? {}),
  };
  const ws = new WorkflowStateService();
  const orch: any = { execute: vi.fn(async () => {}) };
  const svc = new OrdersService(
    repo,
    new OrdersBuilder(new ProductColumnsBuilder(), ws),
    validation,
    billing,
    prisma,
    ws,
    new WorkflowBuilder(ws),
    orch,
  );
  return { svc, repo, billing, orch, tx, validation, sheetRow };
}
