import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaperRepository } from './paper.repository.js';

describe('PaperRepository', () => {
  let repository: PaperRepository;

  const prisma = {
    order_paper: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },

    order_sheet: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },

    order_sheet_items: {
      findMany: vi.fn(),
    },

    master_group: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repository = new PaperRepository(prisma as any);
  });

  describe('findTodayPaper', () => {
    it('should query prisma correctly', async () => {
      prisma.order_paper.findFirst.mockResolvedValue(null);

      const today = new Date();
      const tomorrow = new Date();

      await repository.findTodayPaper(today, tomorrow);

      expect(prisma.order_paper.findFirst).toHaveBeenCalledWith({
        where: {
          sale_date: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          order_sheet: true,
        },
      });
    });
  });

  describe('findLatestPaper', () => {
    it('should query latest paper', async () => {
      prisma.order_paper.findFirst.mockResolvedValue(null);

      await repository.findLatestPaper();

      expect(prisma.order_paper.findFirst).toHaveBeenCalledWith({
        orderBy: {
          order_date: 'desc',
        },
        include: {
          order_sheet: true,
        },
      });
    });
  });

  describe('findPaperById', () => {
    it('should query by id', async () => {
      await repository.findPaperById(5);

      expect(prisma.order_paper.findUnique).toHaveBeenCalledWith({
        where: {
          id: 5,
        },
      });
    });
  });

  describe('findOrderPaper', () => {
    it('should query paper by date range', async () => {
      const today = new Date();
      const tomorrow = new Date();

      await repository.findOrderPaper(today, tomorrow);

      expect(prisma.order_paper.findFirst).toHaveBeenCalledWith({
        where: {
          order_date: {
            gte: today,
            lt: tomorrow,
          },
        },
      });
    });
  });

  describe('getActiveGroups', () => {
    it('should query active groups', async () => {
      await repository.getActiveGroups();

      expect(prisma.master_group.findMany).toHaveBeenCalledWith({
        where: {
          is_active: true,
        },
      });
    });
  });

  describe('generateOrderPaper', () => {
    it('should create draft paper with next day sale date', async () => {
      const date = new Date('2026-01-01');

      await repository.generateOrderPaper(date);

      const createCall = prisma.order_paper.create.mock.calls[0][0];

      expect(createCall.data.order_date).toEqual(date);

      expect(createCall.data.status).toBe('DRAFT');

      const expectedSaleDate = new Date(date);

      expectedSaleDate.setDate(expectedSaleDate.getDate() + 1);

      expect(createCall.data.sale_date).toEqual(expectedSaleDate);
    });
  });

  describe('generateOrderSheets', () => {
    it('should create sheets using createMany', async () => {
      await repository.generateOrderSheets(1, [{ id: 10 }, { id: 20 }]);

      expect(prisma.order_sheet.createMany).toHaveBeenCalledWith({
        data: [
          {
            order_paper_id: 1,
            group_id: 10,
          },
          {
            order_paper_id: 1,
            group_id: 20,
          },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('submitNightEntry', () => {
    it('should update status', async () => {
      await repository.submitNightEntry(1);

      expect(prisma.order_paper.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 1,
          },
          data: expect.objectContaining({
            status: 'NIGHT_SUBMITTED',
          }),
        }),
      );
    });
  });

  describe('submitMorningEntry', () => {
    it('should update status', async () => {
      await repository.submitMorningEntry(1);

      expect(prisma.order_paper.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'MORNING_SUBMITTED',
          }),
        }),
      );
    });
  });

  describe('finalizePaper', () => {
    it('should update status', async () => {
      await repository.finalizePaper(1);

      expect(prisma.order_paper.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FINALIZED',
          }),
        }),
      );
    });
  });

  describe('reopenPaper', () => {
    it('should update status and reason', async () => {
      await repository.reopenPaper(1, 'Correction');

      expect(prisma.order_paper.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REOPENED',
            reopen_reason: 'Correction',
          }),
        }),
      );
    });
  });

  describe('getPaperSheets', () => {
    it('should query sheets by paper id', async () => {
      await repository.getPaperSheets(1);

      expect(prisma.order_sheet.findMany).toHaveBeenCalledWith({
        where: {
          order_paper_id: 1,
        },

        include: {
          master_group: {
            select: {
              id: true,
              name: true,
            },
          },
        },

        orderBy: {
          id: 'asc',
        },
      });
    });
  });

  describe('getSheetItems', () => {
    it('should query sheet items with all required relations', async () => {
      await repository.getSheetItems(5);

      expect(prisma.order_sheet_items.findMany).toHaveBeenCalledWith({
        where: {
          order_sheet_id: 5,
        },

        include: {
          master_client: true,

          master_product: {
            include: {
              master_brand: true,
              master_product_group: true,
              master_packaging_type: true,
              master_product_type: true,
            },
          },
        },
      });
    });
  });
});
