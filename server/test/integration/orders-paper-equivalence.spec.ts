import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

let app: INestApplication;
let prisma: PrismaService;

let token: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();

  await app.init();
  const loginResponse = await request(app.getHttpServer())
    .post('/auth/login')
    .send({
      username: 'admin',
      password: 'admin123',
    });

  token = loginResponse.body.accessToken;

  prisma = moduleRef.get(PrismaService);

  await prisma.$connect();

  console.log('connected');
});

afterAll(async () => {
  await app.close();
});

it('orders and paper night submit should produce same status', async () => {
  let paper;

  try {
    const randomDay = 100 + Math.floor(Math.random() * 1000);

    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() + randomDay);

    const saleDate = new Date(orderDate);
    saleDate.setDate(saleDate.getDate() + 1);

    paper = await prisma.order_paper.create({
      data: {
        order_date: orderDate,
        sale_date: saleDate,
        status: 'DRAFT',
      },
    });
  } catch (error) {
    console.error(error);
    throw error;
  }

  await prisma.order_paper.update({
    where: { id: paper.id },
    data: { status: 'DRAFT' },
  });

  const paperResponse = await request(app.getHttpServer())
    .post(`/papers/${paper.id}/submit-night`)
    .set('Authorization', `Bearer ${token}`);

  const paperStatus = paperResponse.body.status;
});

it('orders and paper morning submit should produce same status', async () => {
  const randomDay = 100 + Math.floor(Math.random() * 1000);

  const orderDate = new Date();

  orderDate.setDate(orderDate.getDate() + randomDay);

  const saleDate = new Date(orderDate);

  saleDate.setDate(saleDate.getDate() + 1);

  const group = await prisma.master_group.findFirst();

  const client = await prisma.master_client.findFirst({
    where: {
      delivery_group_id: group!.id,
    },
  });

  const product = await prisma.master_product.findFirst({
    where: {
      is_active: true,
    },
  });

  const paper = await prisma.order_paper.create({
    data: {
      order_date: orderDate,
      sale_date: saleDate,
      status: 'NIGHT_SUBMITTED',
    },
  });

  const sheet = await prisma.order_sheet.create({
    data: {
      order_paper_id: paper.id,
      group_id: group!.id,
    },
  });

  await prisma.order_sheet_items.create({
    data: {
      order_sheet_id: sheet.id,
      client_id: client!.id,
      product_id: product!.id,
      ordered_qty: 10,
      delivered_qty: 10,
    },
  });

  await prisma.order_paper.update({
    where: {
      id: paper.id,
    },
    data: {
      status: 'NIGHT_SUBMITTED',
      morning_entry_submitted_at: null,
    },
  });

  const paperResponse = await request(app.getHttpServer())
    .post(`/papers/${paper.id}/submit-morning`)
    .set('Authorization', `Bearer ${token}`);

  const paperStatus = paperResponse.body.status;
});

it('orders and paper finalize should produce same status', async () => {
  const daysAhead = 100 + Math.floor(Math.random() * 1000);

  const orderDate = new Date();

  orderDate.setDate(orderDate.getDate() + daysAhead);

  const saleDate = new Date(orderDate);

  saleDate.setDate(saleDate.getDate() + 1);

  const group = await prisma.master_group.findFirst();

  const paper = await prisma.order_paper.create({
    data: {
      order_date: orderDate,
      sale_date: saleDate,
      status: 'MORNING_SUBMITTED',
    },
  });

  await prisma.order_sheet.create({
    data: {
      order_paper_id: paper.id,
      group_id: group!.id,
    },
  });

  await prisma.order_paper.update({
    where: {
      id: paper.id,
    },
    data: {
      status: 'MORNING_SUBMITTED',
      finalized_at: null,
    },
  });

  const paperResponse = await request(app.getHttpServer())
    .post(`/papers/${paper.id}/finalize`)
    .set('Authorization', `Bearer ${token}`);

  const paperStatus = paperResponse.body.status;
});

it('orders and paper reopen should produce same status', async () => {
  const daysAhead = 100 + Math.floor(Math.random() * 1000);

  const orderDate = new Date();

  orderDate.setDate(orderDate.getDate() + daysAhead);

  const saleDate = new Date(orderDate);

  saleDate.setDate(saleDate.getDate() + 1);

  const paper = await prisma.order_paper.create({
    data: {
      order_date: orderDate,
      sale_date: saleDate,
      status: 'FINALIZED',
    },
  });

  const reason = 'integration test';

  await prisma.order_paper.update({
    where: {
      id: paper.id,
    },
    data: {
      status: 'FINALIZED',
      reopened_at: null,
      reopen_reason: null,
    },
  });

  const paperResponse = await request(app.getHttpServer())
    .post(`/papers/${paper.id}/reopen`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      reason,
    });

  expect(paperResponse.status).toBe(201);

  expect(paperResponse.body.status).toBe('REOPENED');
});

afterAll(async () => {
  await prisma.order_paper.deleteMany({
    where: {
      reopen_reason: 'integration test',
    },
  });

  await app.close();
});
