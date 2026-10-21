import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ParseIntPipe, NotFoundException } from '@nestjs/common';
import { TrayCalculationService } from '../src/common/calculators/tray-calculation.service.js';
import { OrdersRepository } from '../src/modules/transactions/orders/orders.repository.js';
import { OrdersValidationService } from '../src/modules/transactions/orders/services/orders-validation.service.js';
import { OrdersBuilder } from '../src/modules/transactions/orders/order.builder.js';
import { ProductColumnsBuilder } from '../src/common/builders/product-columns.builder.js';
import { WorkflowStateService } from '../src/modules/transactions/workflow/workflow-state.service.js';
import { WorkflowBuilder } from '../src/modules/transactions/workflow/workflow.builder.js';
import { DependencyOrchestratorService } from '../src/modules/transactions/dependencies/dependency-orchestrator.service.js';
import { NightBillingService } from '../src/modules/transactions/orders/services/night-billing.service.js';
import { FinalBillingService } from '../src/modules/transactions/orders/services/final-billing.service.js';
import { AddProductDto } from '../src/modules/transactions/orders/dto/add-product.dto.js';
import { SaveNightEntriesDto } from '../src/modules/transactions/orders/dto/save-night-entries.dto.js';
import { makeBilling, sheet } from './helper.js';
import { makeService } from './svc.js';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tray = new TrayCalculationService({} as any);
const rule = (id: number, o: any = {}) =>
  ({
    id,
    tray_type_id: id,
    brand_id: 1,
    product_group_id: null,
    product_type_id: null,
    packaging_type_id: null,
    applies_to_packaging: false,
    ...o,
  }) as any;
const prod = {
  brand_id: 1,
  product_group_id: 2,
  product_type_id: 3,
  packaging_type_id: 4,
};

describe('S-17 tray rule resolution', () => {
  it('equal-specificity ties resolve deterministically regardless of DB order', () => {
    const a = rule(1, { product_group_id: 2 }),
      b = rule(2, { product_type_id: 3 });
    expect(tray.resolveTrayRule(prod, [a, b])?.id).toBe(
      tray.resolveTrayRule(prod, [b, a])?.id,
    );
  });
  it('applies_to_packaging=true with null packaging_type_id matches only null-packaging products', () => {
    const r = rule(1, { applies_to_packaging: true, packaging_type_id: null });
    expect(tray.resolveTrayRule(prod, [r])).toBeNull(); // documents the sharp edge
    expect(
      tray.resolveTrayRule({ ...prod, packaging_type_id: null }, [r])?.id,
    ).toBe(1);
  });
});

describe('S-18 fallback distributor not persisted', () => {
  it('createSheetProduct persists product_link_id / resolved_via_fallback', async () => {
    let args: any;
    const db = {
      order_sheet_product: {
        upsert: async (a: any) => {
          args = a;
        },
      },
    };
    await new OrdersRepository({} as any).createSheetProduct(
      { order_sheet_id: 1, product_id: 2 },
      db as any,
    );
    expect(Object.keys(args.create)).toContain('resolved_via_fallback');
  });
});

describe('S-19 not-found handling', () => {
  it('getSheetService -> 404 for missing sheet', async () => {
    const { svc } = makeService({ repo: { findSheetById: async () => null } });
    await expect(svc.getSheetService(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('getSheetItemsService -> 404 for missing sheet (not [])', async () => {
    const { svc } = makeService({
      repo: { getSheetItems: async () => [], findSheetById: async () => null },
    });
    await expect(svc.getSheetItemsService(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('S-20 over-fetching', () => {
  it('getSheetItems does not include full master_client / distributor rows', async () => {
    let args: any;
    const db = {
      order_sheet_items: {
        findMany: async (a: any) => {
          args = a;
          return [];
        },
      },
    };
    await new OrdersRepository({} as any).getSheetItems(1, db as any);
    expect(args.include.master_client).not.toBe(true);
    expect(args.include.product_link.include?.distributor).not.toBe(true);
  });
});

describe('S-21 authorization / audit', () => {
  it('orders controller binds the caller (no per-sheet scoping possible)', () => {
    expect(
      read('src/modules/transactions/orders/orders.controller.ts'),
    ).toMatch(/@Req\(|@CurrentUser|@User\(/);
  });
  it('financial rows carry an actor column', () => {
    const model = /model order_sheet_items \{[\s\S]*?\n\}/.exec(
      read('prisma/schema.prisma'),
    )![0];
    expect(model).toMatch(/updated_by|created_by|last_edited_by/);
  });
});

describe('S-22 duplicate outbox work on reopened saves', () => {
  it('N saves in REOPENED enqueue at most one pending cascade per sheet', async () => {
    const enqueue = vi.fn(async () => ({}));
    const orch = new DependencyOrchestratorService(
      { recalculateFromSheet: async () => {} } as any,
      {} as any,
      {} as any,
      { enqueue } as any,
    );
    for (let i = 0; i < 5; i++)
      await orch.execute('ORDERS' as any, 'ON_SAVE' as any, {
        paperId: 9,
        sheetId: 1,
        paperStatus: 'REOPENED' as any,
        tx: {} as any,
      });
    console.log(
      'S-22 outbox rows enqueued for 5 saves =',
      enqueue.mock.calls.length,
    );
    expect(enqueue.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('S-23 misc', () => {
  it('ParseIntPipe rejects ids beyond Int4', async () => {
    await expect(
      new ParseIntPipe().transform('99999999999', { type: 'param' } as any),
    ).rejects.toThrow();
  });
  it('ParseIntPipe rejects negative ids', async () => {
    await expect(
      new ParseIntPipe().transform('-5', { type: 'param' } as any),
    ).rejects.toThrow();
  });
  it('fractional ids are rejected by DTOs (@IsInt)', async () => {
    const e1 = await validate(
      plainToInstance(AddProductDto, { productId: 1.5 }),
    );
    const e2 = await validate(
      plainToInstance(SaveNightEntriesDto, {
        clientId: 1.5,
        productId: 2.5,
        orderedQty: 1,
      }),
    );
    expect(e1.length + e2.length).toBeGreaterThan(0);
  });
  it('inactive-product message shows the product name, not a bare id', async () => {
    const v = new OrdersValidationService({} as any, tray);
    const db: any = {
      master_product: { findUnique: async () => ({ id: 7, is_active: false }) },
    };
    await expect(v.validateProduct(7, db)).rejects.toThrow(/Product "(?!7")/);
  });
  it('morning-incomplete message names an identifiable product when product.code is null (actual: blank ", ")', async () => {
    const v = new OrdersValidationService(
      {
        getMorningValidationItems: async () => [
          { id: 1, delivered_qty: null, master_product: { code: null } },
          { id: 2, delivered_qty: null, master_product: { code: null } },
        ],
      } as any,
      tray,
    );
    await expect(
      v.validateMorningEntriesComplete(1, {} as any),
    ).rejects.toThrow(/missing for: \S/);
  });
  it('empty morning save does not mark the sheet as "morning saved"', async () => {
    const { svc, repo } = makeService({ status: 'NIGHT_SUBMITTED' });
    await svc.saveMorningEntriesService(1, [], undefined);
    expect(repo.markOrderMorningEntrySaved).not.toHaveBeenCalled();
  });
  it('4xx validation failures are not logged at error level', async () => {
    const { svc } = makeService({ status: 'FINALIZED' });
    const spy = vi
      .spyOn((svc as any).logger, 'error')
      .mockImplementation(() => {});
    await expect(
      svc.saveNightEntriesService(
        1,
        [{ clientId: 1, productId: 1, orderedQty: 1 }],
        undefined,
      ),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it('UI can tell which quantity is editable (night vs morning flag)', () => {
    const ws = new WorkflowStateService();
    expect(
      Object.keys(new WorkflowBuilder(ws).buildOrdersWorkflow('DRAFT' as any)),
    ).toEqual(expect.arrayContaining(['canEditNight', 'canEditMorning']));
  });
  it('after a partial first morning save, un-sent lines display ordered qty, not 0', () => {
    const b = new OrdersBuilder(
      new ProductColumnsBuilder(),
      new WorkflowStateService(),
    );
    const p: any = {
      id: 10,
      master_brand: { name: 'B' },
      master_product_group: { name: 'G' },
      master_product_type: { name: 'T' },
      master_packaging_type: { name: 'P' },
      packaging_size: 1,
      packaging_unit: 'L',
    };
    const out = b.buildOrderBillingSection(
      {
        milkProducts: [p],
        nonMilkProducts: [],
        milkClients: [{ id: 7, name: 'C' }],
        nonMilkClients: [],
        sheetItems: [
          {
            client_id: 7,
            product_id: 10,
            ordered_qty: 5,
            delivered_qty: null,
            night_bill_amount: 100,
            final_bill_amount: null,
          } as any,
        ],
      },
      'NIGHT_SUBMITTED' as any,
      true,
    );
    expect(out.milkGrid.rows[0].product_10).toBe(5);
  });
  it('night (ex-GST) and final (incl-GST) bill amounts are comparable for a GST-exclusive 12% product', () => {
    const night = new NightBillingService().calculate(
      10,
      10,
      1,
    ).nightBillAmount;
    const fin = new FinalBillingService().calculate(
      10,
      10,
      12,
      false,
      1,
    ).finalBillAmount;
    console.log(
      'S-23 night =',
      night,
      ' final =',
      fin,
      ' for identical qty/rate',
    );
    expect(fin).toBe(night);
  });
  it('units_per_order_unit participates in billing', () => {
    expect(
      read(
        'src/modules/transactions/orders/services/night-billing.service.ts',
      ) +
        read(
          'src/modules/transactions/orders/services/final-billing.service.ts',
        ),
    ).toMatch(/units_per_order_unit|unitsPerOrderUnit/);
  });
  it('an inactive client can still be zeroed in DRAFT', async () => {
    const db: any = {
      master_client: {
        findMany: async () => [
          {
            id: 7,
            name: 'Old Client',
            is_active: false,
            delivery_group_id: 5,
            categories: [{ category: 'MILK' }],
          },
        ],
      },
      master_product: {
        findMany: async () => [
          {
            id: 10,
            is_active: true,
            brand_id: 1,
            product_group_id: 2,
            product_type_id: null,
            packaging_type_id: null,
            master_product_group: { category: 'MILK' },
          },
        ],
      },
    };
    await expect(
      new OrdersValidationService({} as any, tray).validateEntriesBatch(
        [{ clientId: 7, productId: 10 }],
        5,
        db,
      ),
    ).resolves.toBeDefined();
  });
});
