import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mocked } from 'vitest';
import {
  GatepassDatePolicy,
} from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { PurchaseRepository } from '../purchase.repository.js';
import { PurchaseCommercialService } from './purchase-commercial.service.js';

describe('PurchaseCommercialService', () => {
  let service: PurchaseCommercialService;
  let purchaseRepository: Mocked<PurchaseRepository>;
  let prisma: Mocked<PrismaService>;
  let db: Record<string, unknown>;

  beforeEach(() => {
    purchaseRepository = {
      getProductLink: vi.fn(),
      findProductLinkRateForDate: vi.fn(),
    } as unknown as Mocked<PurchaseRepository>;

    prisma = {} as Mocked<PrismaService>;
    db = {};

    service = new PurchaseCommercialService(
      purchaseRepository,
      prisma,
    );
  });

  describe('resolve', () => {
    const saleDate = new Date('2026-06-15T00:00:00.000Z');

    it('resolves a same-day purchase rate using the supplied db client', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '42.50',
      } as any);

      const result = await service.resolve(
        saleDate,
        20,
        30,
        GatepassDatePolicy.SAME_DAY,
        db as any,
      );

      expect(purchaseRepository.getProductLink).toHaveBeenCalledWith(
        20,
        30,
        db,
        false,
      );

      expect(
        purchaseRepository.findProductLinkRateForDate,
      ).toHaveBeenCalledWith(
        101,
        new Date('2026-06-15T00:00:00.000Z'),
        db,
      );

      expect(result).toEqual({
        productLinkId: 101,
        purchaseRate: 42.5,
        gatepassDate: new Date('2026-06-15T00:00:00.000Z'),
      });
    });

    it('resolves PREVIOUS_DAY using the previous calendar day', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '40',
      } as any);

      const result = await service.resolve(
        saleDate,
        20,
        30,
        GatepassDatePolicy.PREVIOUS_DAY,
        db as any,
      );

      expect(
        purchaseRepository.findProductLinkRateForDate,
      ).toHaveBeenCalledWith(
        101,
        new Date('2026-06-14T00:00:00.000Z'),
        db,
      );

      expect(result.gatepassDate).toEqual(
        new Date('2026-06-14T00:00:00.000Z'),
      );
    });

    it('passes activeOnly=true to the product-link lookup', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '42.5',
      } as any);

      await service.resolve(
        saleDate,
        20,
        30,
        GatepassDatePolicy.SAME_DAY,
        db as any,
        true,
      );

      expect(purchaseRepository.getProductLink).toHaveBeenCalledWith(
        20,
        30,
        db,
        true,
      );
    });

    it('defaults activeOnly to false', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '42.5',
      } as any);

      await service.resolve(
        saleDate,
        20,
        30,
        GatepassDatePolicy.SAME_DAY,
        db as any,
      );

      expect(purchaseRepository.getProductLink).toHaveBeenCalledWith(
        20,
        30,
        db,
        false,
      );
    });

    it('throws when no product link exists', async () => {
      purchaseRepository.getProductLink.mockResolvedValue(null);

      await expect(
        service.resolve(
          saleDate,
          20,
          30,
          GatepassDatePolicy.SAME_DAY,
          db as any,
        ),
      ).rejects.toThrow(
        'No product link found for distributor 20 and product 30',
      );

      expect(
        purchaseRepository.findProductLinkRateForDate,
      ).not.toHaveBeenCalled();
    });

    it('throws the active-link-specific error when activeOnly is true', async () => {
      purchaseRepository.getProductLink.mockResolvedValue(null);

      await expect(
        service.resolve(
          saleDate,
          20,
          30,
          GatepassDatePolicy.SAME_DAY,
          db as any,
          true,
        ),
      ).rejects.toThrow(
        'Distributor 20 does not have an active product link for product 30',
      );

      expect(
        purchaseRepository.findProductLinkRateForDate,
      ).not.toHaveBeenCalled();
    });

    it('throws when no rate exists for the resolved gatepass date', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue(null);

      await expect(
        service.resolve(
          saleDate,
          20,
          30,
          GatepassDatePolicy.PREVIOUS_DAY,
          db as any,
        ),
      ).rejects.toThrow(
        'Rate not found for distributor 20 product 30 on 2026-06-14',
      );
    });

    it('converts the repository purchase rate to a number', async () => {
      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '123.456',
      } as any);

      const result = await service.resolve(
        saleDate,
        20,
        30,
        GatepassDatePolicy.SAME_DAY,
        db as any,
      );

      expect(result.purchaseRate).toBe(123.456);
      expect(typeof result.purchaseRate).toBe('number');
    });

    it('does not mutate the supplied sale date', async () => {
      const originalSaleDate = new Date('2026-06-15T00:00:00.000Z');
      const originalTime = originalSaleDate.getTime();

      purchaseRepository.getProductLink.mockResolvedValue({
        id: 101,
      } as any);

      purchaseRepository.findProductLinkRateForDate.mockResolvedValue({
        purchase_rate: '42.5',
      } as any);

      await service.resolve(
        originalSaleDate,
        20,
        30,
        GatepassDatePolicy.PREVIOUS_DAY,
        db as any,
      );

      expect(originalSaleDate.getTime()).toBe(originalTime);
    });
  });

  describe('resolveGatepassDateFor', () => {
    it('returns the same date for SAME_DAY', () => {
      const saleDate = new Date('2026-06-15T00:00:00.000Z');

      const result = service.resolveGatepassDateFor(
        saleDate,
        GatepassDatePolicy.SAME_DAY,
      );

      expect(result).toEqual(
        new Date('2026-06-15T00:00:00.000Z'),
      );
    });

    it('returns the previous calendar day for PREVIOUS_DAY', () => {
      const saleDate = new Date('2026-06-15T00:00:00.000Z');

      const result = service.resolveGatepassDateFor(
        saleDate,
        GatepassDatePolicy.PREVIOUS_DAY,
      );

      expect(result).toEqual(
        new Date('2026-06-14T00:00:00.000Z'),
      );
    });

    it('handles the first day of a month', () => {
      const saleDate = new Date('2026-06-01T00:00:00.000Z');

      const result = service.resolveGatepassDateFor(
        saleDate,
        GatepassDatePolicy.PREVIOUS_DAY,
      );

      expect(result).toEqual(
        new Date('2026-05-31T00:00:00.000Z'),
      );
    });

    it('handles the first day of a year', () => {
      const saleDate = new Date('2026-01-01T00:00:00.000Z');

      const result = service.resolveGatepassDateFor(
        saleDate,
        GatepassDatePolicy.PREVIOUS_DAY,
      );

      expect(result).toEqual(
        new Date('2025-12-31T00:00:00.000Z'),
      );
    });

    it('does not mutate the supplied date', () => {
      const saleDate = new Date('2026-06-15T00:00:00.000Z');
      const originalTime = saleDate.getTime();

      service.resolveGatepassDateFor(
        saleDate,
        GatepassDatePolicy.PREVIOUS_DAY,
      );

      expect(saleDate.getTime()).toBe(originalTime);
    });
  });
});