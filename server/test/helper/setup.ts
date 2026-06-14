import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { vi } from 'vitest';

/**
 * Test Setup and Mock Factories
 * Provides reusable mock data and Prisma service for all integration tests
 */

export class MockPrismaService {
  order_paper = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };

  purchase_paper = {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };

  vehicle_allocation_paper = {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };

  vehicle_allocation = {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  vehicle_distribution_assignment = {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  purchase_entry = {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  };

  master_vehicle = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };

  master_distributor = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };

  master_product = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };

  distributor_procurement_rule = {
    findMany: vi.fn(),
  };

  distributor_product_rate = {
    findMany: vi.fn(),
  };

  order_sheet = {
    findMany: vi.fn(),
  };

  order_sheet_items = {
    findMany: vi.fn(),
  };

  master_product_group = {
    findMany: vi.fn(),
  };

  $transaction = vi.fn((callback) => callback(this));
}

export async function createTestingModule(
  imports: any[] = [],
  providers: any[] = [],
) {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports,
    providers: [
      ...providers,
      {
        provide: PrismaService,
        useClass: MockPrismaService,
      },
    ],
  }).compile();

  return moduleFixture;
}
