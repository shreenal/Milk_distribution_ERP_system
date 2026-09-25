import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
  beforeAll,
  afterAll,
} from 'vitest';
import request from 'supertest';
import { AppModule } from '../../../app.module.js';
import { Server } from 'node:http';
import { PaperRepository } from '../paper/paper.repository.js';
import {
  assertSeedDataPresent,
  resetPaperData,
  testPrisma,
} from '../../../../test/helper/db.js';

describe('OrdersController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let sheetId: number;
  let fixtureCounter = 0;

  const paperRepository = new PaperRepository(testPrisma);

  beforeEach(async () => {
    await resetPaperData();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    accessToken = await loginAsEmployee();

    const orderDate = new Date();
    orderDate.setUTCHours(0, 0, 0, 0);
    orderDate.setUTCDate(orderDate.getUTCDate() + 1000 + fixtureCounter++);

    const paper = await paperRepository.generatePaperFromOrderDate(orderDate);

    const groups = await paperRepository.getActiveGroups();

    await paperRepository.generateOrderSheets(paper.id, groups);

    const sheet = await testPrisma.order_sheet.findFirstOrThrow({
      where: {
        order_paper_id: paper.id,
      },
    });

    sheetId = sheet.id;
  });

  beforeAll(async () => {
    await assertSeedDataPresent();
  });

  afterAll(async () => {
    await resetPaperData();
    await testPrisma.$disconnect();
  });

  afterEach(async () => {
    await app.close();
  });

  function server() {
    return app.getHttpServer() as Server;
  }

  async function loginAsEmployee(): Promise<string> {
    const response = await request(server())
      .post('/auth/login')
      .send({
        username: 'employee1',
        password: 'password123',
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.username).toBe('employee1');
    expect(response.body.user.role).toBe('EMPLOYEE');

    return response.body.accessToken;
  }

  describe('authentication', () => {
    it('rejects unauthenticated GET /orders/sheet/:sheetId', async () => {
      await request(server()).get('/orders/sheet/1').expect(401);
    });

    it('rejects unauthenticated GET /orders/products', async () => {
      await request(server()).get('/orders/products').expect(401);
    });

    it('rejects unauthenticated GET /orders/sheet/:sheetId/items', async () => {
      await request(server()).get('/orders/sheet/1/items').expect(401);
    });

    it('rejects unauthenticated POST /orders/sheet/:sheetId/night-save', async () => {
      await request(server())
        .post('/orders/sheet/1/night-save')
        .send([])
        .expect(401);
    });

    it('rejects unauthenticated POST /orders/sheet/:sheetId/morning-save', async () => {
      await request(server())
        .post('/orders/sheet/1/morning-save')
        .send([])
        .expect(401);
    });

    it('rejects unauthenticated POST /orders/sheet/:sheetId/products', async () => {
      await request(server())
        .post('/orders/sheet/1/products')
        .send({ productId: 1 })
        .expect(401);
    });

    it('rejects unauthenticated DELETE /orders/sheet/:sheetId/products/:productId', async () => {
      await request(server()).delete('/orders/sheet/1/products/1').expect(401);
    });
  });

  describe('authenticated endpoints', () => {
    it('can access available products', async () => {
      const response = await request(server())
        .get('/orders/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ category: 'MILK' })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('can access sheet items for an existing sheet', async () => {
      const response = await request(server())
        .get(`/orders/sheet/${sheetId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('can retrieve an existing order sheet', async () => {
      const response = await request(server())
        .get(`/orders/sheet/${sheetId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);

      expect(response.body).toBeDefined();
      expect(response.body.sheet).toBeDefined();
      expect(response.body.workflow).toBeDefined();
    });
  });

  describe('DTO validation at the HTTP boundary', () => {
    it('rejects night-save with an out-of-range orderedQty', async () => {
      const response = await request(server())
        .post(`/orders/sheet/${sheetId}/night-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: 1, productId: 1, orderedQty: -5 }]);

      expect(response.status).toBe(400);
    });

    it('rejects add-product with a missing productId', async () => {
      const response = await request(server())
        .post(`/orders/sheet/${sheetId}/products`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('write endpoints (DB-state assertions)', () => {
    it('adds a product to the sheet and persists the pin', async () => {
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { is_active: true, show_by_default: false },
      });

      const response = await request(server())
        .post(`/orders/sheet/${sheetId}/products`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id })
        .expect(201);

      expect(response.body).toBeDefined();

      const pin = await testPrisma.order_sheet_product.findUnique({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheetId,
            product_id: product.id,
          },
        },
      });

      expect(pin).not.toBeNull();
    });

    it('saves night entries and persists ordered_qty', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });

      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });

      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/night-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, orderedQty: 10 }])
        .expect(201);

      const item = await testPrisma.order_sheet_items.findFirst({
        where: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
        },
      });

      expect(item).not.toBeNull();
      expect(Number(item!.ordered_qty)).toBe(10);
    });

    it('rejects morning-save while the paper is still DRAFT', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/morning-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, deliveredQty: 5 }])
        .expect(400);
    });

    it('saves morning entries once the paper is NIGHT_SUBMITTED and persists delivered_qty', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });
      const link = await testPrisma.master_product_link.findFirstOrThrow({
        where: { product_id: product.id, is_active: true },
      });

      // Establish an ordered_qty row first (morning-save requires an existing item).
      await testPrisma.order_sheet_product.create({
        data: {
          order_sheet_id: sheetId,
          product_id: product.id,
          product_link_id: link.id,
        },
      });
      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      });

      await testPrisma.order_paper.update({
        where: { id: sheet.order_paper_id },
        data: { status: 'NIGHT_SUBMITTED' as any },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/morning-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, deliveredQty: 8 }])
        .expect(201);

      const item = await testPrisma.order_sheet_items.findFirst({
        where: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
        },
      });

      expect(Number(item!.delivered_qty)).toBe(8);

      const updatedSheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      expect(updatedSheet.order_morning_entry_saved_at).not.toBeNull();
    });

    it('removes a non-default product with zero ordered quantity', async () => {
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: {
          is_active: true,
          show_by_default: false,
          code: 'GOV-LASSI-PCH-200',
        },
      });
      const link = await testPrisma.master_product_link.findFirstOrThrow({
        where: { product_id: product.id, is_active: true },
      });

      await testPrisma.order_sheet_product.create({
        data: {
          order_sheet_id: sheetId,
          product_id: product.id,
          product_link_id: link.id,
        },
      });

      await request(server())
        .delete(`/orders/sheet/${sheetId}/products/${product.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const pin = await testPrisma.order_sheet_product.findUnique({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheetId,
            product_id: product.id,
          },
        },
      });

      expect(pin).toBeNull();
    });
  });

  describe('write endpoints (DB-state assertions)', () => {
    it('adds a product to the sheet and persists the pin', async () => {
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { is_active: true, show_by_default: false },
      });

      const response = await request(server())
        .post(`/orders/sheet/${sheetId}/products`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id })
        .expect(201);

      expect(response.body).toBeDefined();

      const pin = await testPrisma.order_sheet_product.findUnique({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheetId,
            product_id: product.id,
          },
        },
      });

      expect(pin).not.toBeNull();
    });

    it('saves night entries and persists ordered_qty', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });

      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });

      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/night-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, orderedQty: 10 }])
        .expect(201);

      const item = await testPrisma.order_sheet_items.findFirst({
        where: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
        },
      });

      expect(item).not.toBeNull();
      expect(Number(item!.ordered_qty)).toBe(10);
    });

    it('rejects morning-save while the paper is still DRAFT', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/morning-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, deliveredQty: 5 }])
        .expect(400);
    });

    it('saves morning entries once the paper is NIGHT_SUBMITTED and persists delivered_qty', async () => {
      const sheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      const client = await testPrisma.master_client.findFirstOrThrow({
        where: { delivery_group_id: sheet.group_id, is_active: true },
      });
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: { code: 'GOV-COW-500' },
      });
      const link = await testPrisma.master_product_link.findFirstOrThrow({
        where: { product_id: product.id, is_active: true },
      });

      // Establish an ordered_qty row first (morning-save requires an existing item).
      await testPrisma.order_sheet_product.create({
        data: {
          order_sheet_id: sheetId,
          product_id: product.id,
          product_link_id: link.id,
        },
      });
      await testPrisma.order_sheet_items.create({
        data: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
          product_link_id: link.id,
          ordered_qty: 10,
        },
      });

      await testPrisma.order_paper.update({
        where: { id: sheet.order_paper_id },
        data: { status: 'NIGHT_SUBMITTED' as any },
      });

      await request(server())
        .post(`/orders/sheet/${sheetId}/morning-save`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send([{ clientId: client.id, productId: product.id, deliveredQty: 8 }])
        .expect(201);

      const item = await testPrisma.order_sheet_items.findFirst({
        where: {
          order_sheet_id: sheetId,
          client_id: client.id,
          product_id: product.id,
        },
      });

      expect(Number(item!.delivered_qty)).toBe(8);

      const updatedSheet = await testPrisma.order_sheet.findUniqueOrThrow({
        where: { id: sheetId },
      });
      expect(updatedSheet.order_morning_entry_saved_at).not.toBeNull();
    });

    it('removes a non-default product with zero ordered quantity', async () => {
      const product = await testPrisma.master_product.findFirstOrThrow({
        where: {
          is_active: true,
          show_by_default: false,
          code: 'GOV-LASSI-PCH-200',
        },
      });
      const link = await testPrisma.master_product_link.findFirstOrThrow({
        where: { product_id: product.id, is_active: true },
      });

      await testPrisma.order_sheet_product.create({
        data: {
          order_sheet_id: sheetId,
          product_id: product.id,
          product_link_id: link.id,
        },
      });

      await request(server())
        .delete(`/orders/sheet/${sheetId}/products/${product.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const pin = await testPrisma.order_sheet_product.findUnique({
        where: {
          order_sheet_id_product_id: {
            order_sheet_id: sheetId,
            product_id: product.id,
          },
        },
      });

      expect(pin).toBeNull();
    });
  });
});
