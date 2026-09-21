import {
    INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { AppModule } from '../../../app.module.js';
import { OrdersService } from './orders.service.js';
import { PaperRepository } from '../paper/paper.repository.js';

import {
    assertSeedDataPresent,
    resetPaperData,
    testPrisma,
} from '../../../../test/helper/db.js';

describe('OrdersService concurrency (integration)', () => {
    let app: INestApplication;
    let ordersService: OrdersService;
    let paperRepository: PaperRepository;

    beforeAll(async () => {
        await assertSeedDataPresent();
    });

    beforeEach(async () => {
        await resetPaperData();

        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        ordersService = app.get(OrdersService);
        paperRepository = new PaperRepository(testPrisma);
    });

    afterEach(async () => {
        await app.close();
        await resetPaperData();
    });

    afterAll(async () => {
        await resetPaperData();
        await testPrisma.$disconnect();
    });

    it('converges concurrent night saves to one sheet-product pin and one order item', async () => {
        const orderDate = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
        );

        const paper =
            await paperRepository.generatePaperFromOrderDate(orderDate);

        const groups = await paperRepository.getActiveGroups();

        await paperRepository.generateOrderSheets(paper.id, groups);

        const sheet = await testPrisma.order_sheet.findFirstOrThrow({
            where: {
                order_paper_id: paper.id,
            },
        });

        const client = await testPrisma.master_client.findFirstOrThrow({
            where: {
                delivery_group_id: sheet.group_id,
                is_active: true,
            },
        });

        const product = await testPrisma.master_product.findFirstOrThrow({
            where: {
                is_active: true,
                show_by_default: true,
            },
        });

        const entry = {
            clientId: client.id,
            productId: product.id,
            orderedQty: 10,
        };

        const [firstResult, secondResult] = await Promise.all([
            ordersService.saveNightEntriesService(sheet.id, [entry]),
            ordersService.saveNightEntriesService(sheet.id, [entry]),
        ]);

        expect(firstResult).toBeDefined();
        expect(secondResult).toBeDefined();

        const pins = await testPrisma.order_sheet_product.findMany({
            where: {
                order_sheet_id: sheet.id,
                product_id: product.id,
            },
        });

        expect(pins).toHaveLength(1);

        const items = await testPrisma.order_sheet_items.findMany({
            where: {
                order_sheet_id: sheet.id,
                client_id: client.id,
                product_id: product.id,
            },
        });

        expect(items).toHaveLength(1);

        expect(items[0].product_link_id).toBe(
            pins[0].product_link_id,
        );

        expect(Number(items[0].ordered_qty)).toBe(10);
    });
});

