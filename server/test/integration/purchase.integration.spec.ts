import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PurchaseService } from '../../src/modules/purchase/purchase.service.js';
import { PurchaseRepository } from '../../src/modules/purchase/purchase.repository.js';
import { PurchaseBuilder } from '../../src/modules/purchase/purchase.builder.js';
import { PurchaseValidationService } from '../../src/modules/purchase/purchase-validation.service.js';
import { WorkflowStateService } from '../../src/modules/workflow/workflow-state.service.js';
import { ProductColumnsBuilder } from '../../src/common/builders/product-columns.builder.js';
import { SavePurchaseDto } from '../../src/modules/purchase/dto/purchase.dto.js';

/**
 * CORRECTED Purchase Integration Tests
 *
 * Key fixes:
 * 1. ✅ Uses correct constructors with ProductColumnsBuilder dependency
 * 2. ✅ Uses NIGHT_SUBMITTED status (not DRAFT) for purchase edits
 * 3. ✅ Follows actual validation service chain order
 * 4. ✅ Creates VALID fixtures satisfying all earlier validations
 * 5. ✅ Tests actual business logic without mocking getPurchases
 * 6. ✅ Strong assertions on actual persisted data
 *
 * Validation Chain (must satisfy all to proceed):
 * 1. Product exists
 * 2. Vehicle exists
 * 3. Distributor exists (in procurement rules)
 * 4. Vehicle assigned to distributor
 * 5. Distributor has procurement rule for product
 * 6. Allocation exists for vehicle-product
 * 7. Purchased qty <= allocated qty
 */

describe('PurchaseService - CORRECTED Integration Tests', () => {
  let service: PurchaseService;
  let repository: PurchaseRepository;
  let builder: PurchaseBuilder;
  let validationService: PurchaseValidationService;
  let workflowState: WorkflowStateService;
  let productColumnsBuilder: ProductColumnsBuilder;

  // ✅ VALID fixture that satisfies ALL validation requirements
  const validOrderPaper = {
    id: 1,
    status: 'NIGHT_SUBMITTED', // ✅ Only valid statuses for purchase edits
  };

  const validProduct = {
    id: 1,
    brand_id: 1,
    product_group_id: 1,
    code: 'PROD-001',
    packaging_size: 1000,
    packaging_unit: 'ml',
  };

  const validDistributor = {
    id: 1,
    name: 'Dist-1',
  };

  const validVehicle = {
    id: 1,
    vehicle_number: 'V-001',
  };

  // ✅ Valid: vehicle 1 → distributor 1
  const validVehicleAssignment = {
    id: 1,
    vehicle_id: 1,
    distributor_id: 1,
    master_vehicle: validVehicle,
    master_distributor: validDistributor,
  };

  // ✅ Valid: distributor 1 can procure from brand 1 group 1
  const validProcurementRule = {
    id: 1,
    distributor_id: 1,
    brand_id: 1,
    product_group_id: 1,
    master_product_group: {
      id: 1,
      name: 'Milk',
    },

    master_brand: {
      id: 1,
      name: 'Amul',
    },

    master_distributor: {
      id: 1,
      name: 'Dist-1',
    },
  };

  const validVehicleAllocation = {
    id: 1,
    vehicle_id: 1,
    product_id: 1,
    allocated_qty: 100,
  };

  const validDistributorRate = {
    id: 1,
    distributor_id: 1,
    product_id: 1,
    purchase_rate: 150,
    selling_rate: 200,
  };

  const validPurchasePaper = { id: 1 };
  const validVehicleAllocationPaper = { id: 1 };

  beforeEach(() => {
    repository = {
      findOrderPaperById: vi.fn(),
      findVehicleAllocationPaperByOrderPaperId: vi.fn(),
      findVehicleAssignmentsByPaperId: vi.fn(),
      findProducts: vi.fn(),
      findDistributorProcurementRules: vi.fn(),
      findVehicleAllocationsByPaperId: vi.fn(),
      findDistributorProductRates: vi.fn(),
      findPurchasePaperByOrderPaperId: vi.fn(),
      createPurchasePaper: vi.fn(),
      findPurchaseEntries: vi.fn(),
      replacePurchaseEntries: vi.fn(),
    } as any;

    // ✅ FIXED: Correct constructor with ProductColumnsBuilder
    productColumnsBuilder = new ProductColumnsBuilder();
    builder = new PurchaseBuilder(productColumnsBuilder);
    validationService = new PurchaseValidationService(repository);
    workflowState = new WorkflowStateService();

    service = new PurchaseService(
      repository,
      builder,
      validationService,
      workflowState,
    );
  });

  describe('WORKFLOW STATUS VALIDATION', () => {
    it('should reject purchase when status is DRAFT', async () => {
      const draftPaper = { id: 1, status: 'DRAFT' };
      repository.findOrderPaperById = vi.fn().mockResolvedValue(draftPaper);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 },
        ],
      };

      // ✅ VERIFY: Correct error message from service
      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        /cannot be edited in current workflow state/i,
      );
    });

    it('should allow purchase in NIGHT_SUBMITTED status', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper);
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 },
        ],
      };

      // ✅ Should NOT throw
      await service.savePurchases(1, dto);
      expect(repository.replacePurchaseEntries).toHaveBeenCalled();
    });

    it('should allow purchase in REOPENED status', async () => {
      const reopenedPaper = { id: 1, status: 'REOPENED' };
      repository.findOrderPaperById = vi.fn().mockResolvedValue(reopenedPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper);
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 },
        ],
      };

      await service.savePurchases(1, dto);
      expect(repository.replacePurchaseEntries).toHaveBeenCalled();
    });
  });

  describe('CRITICAL: Purchased Qty Exceeds Allocation', () => {
    it('should reject when purchasedQty > allocatedQty', async () => {
      // ✅ All earlier validations pass, test reaches qty check
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]); // allocation = 100

      const dto: SavePurchaseDto = {
        entries: [
          {
            distributorId: 1,
            vehicleId: 1,
            productId: 1,
            purchasedQty: 150, // ❌ Exceeds allocation
          },
        ],
      };

      // ✅ VERIFY: Actual error message from validation service
      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        /Purchased quantity exceeds allocated quantity/,
      );
    });

    it('should allow when purchasedQty ≤ allocatedQty', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper);
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 100 },
        ],
      };

      await service.savePurchases(1, dto);

      const persistedEntries = (repository.replacePurchaseEntries as any).mock
        .calls[0][1];
      expect(persistedEntries[0].purchased_qty).toBe(100);
    });
  });

  describe('CRITICAL: Distributor Assignment Validation', () => {
    it('should reject when vehicle not assigned to purchase distributor', async () => {
      // ✅ NEW: Vehicle 1 assigned to distributor 1
      //         Attempting purchase for distributor 2
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]); // vehicle 1 → dist 1
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([
          validProcurementRule,
          { ...validProcurementRule, id: 2, distributor_id: 2 },
        ]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);

      const dto: SavePurchaseDto = {
        entries: [
          {
            distributorId: 2, // ❌ Vehicle assigned to distributor 1
            vehicleId: 1,
            productId: 1,
            purchasedQty: 50,
          },
        ],
      };

      // ✅ VERIFY: Actual error message
      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        /is not assigned to distributor/,
      );
    });
  });

  describe('CRITICAL: Procurement Rule Validation', () => {
    it('should reject when distributor cannot procure product', async () => {
      // ✅ NEW: Distributor 1 has NO rule for product 99
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi
        .fn()
        .mockResolvedValue([
          validProduct,
          { ...validProduct, id: 99, brand_id: 99, product_group_id: 99 },
        ]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]); // Only for product 1
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([
          validVehicleAllocation,
          { ...validVehicleAllocation, product_id: 99, id: 2 },
        ]);

      const dto: SavePurchaseDto = {
        entries: [
          {
            distributorId: 1,
            vehicleId: 1,
            productId: 99, // ❌ No rule for this product
            purchasedQty: 50,
          },
        ],
      };

      // ✅ VERIFY: Actual error message
      await expect(service.savePurchases(1, dto)).rejects.toThrow(
        /cannot procure product/,
      );
    });
  });

  describe('Amount Calculation', () => {
    it('should calculate: purchase_amount = qty × rate', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([{ ...validDistributorRate, purchase_rate: 200 }]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper);
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 75 },
        ],
      };

      await service.savePurchases(1, dto);

      const persistedEntries = (repository.replacePurchaseEntries as any).mock
        .calls[0][1];

      // ✅ VERIFY: 75 × 200 = 15000
      expect(persistedEntries[0].purchase_amount).toBe(15000);
    });
  });

  describe('Zero Quantity Filtering', () => {
    it('should filter zero-qty entries before persistence', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper);
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 0 }, // ❌ Filtered
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 }, // ✅ Kept
        ],
      };

      await service.savePurchases(1, dto);

      const persistedEntries = (repository.replacePurchaseEntries as any).mock
        .calls[0][1];

      // ✅ VERIFY: Only non-zero entry persisted
      expect(persistedEntries).toHaveLength(1);
      expect(persistedEntries[0].purchased_qty).toBe(50);
    });
  });

  describe('Paper Management', () => {
    it('should create purchase paper if not exists', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(null); // ❌ Doesn't exist
      repository.createPurchasePaper = vi
        .fn()
        .mockResolvedValue(validPurchasePaper); // ✅ Will create
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 },
        ],
      };

      await service.savePurchases(1, dto);

      // ✅ VERIFY: Paper was created with correct paperId
      expect(repository.createPurchasePaper).toHaveBeenCalledWith(1);
    });

    it('should reuse existing purchase paper', async () => {
      repository.findOrderPaperById = vi
        .fn()
        .mockResolvedValue(validOrderPaper);
      repository.findVehicleAllocationPaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validVehicleAllocationPaper);
      repository.findVehicleAssignmentsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAssignment]);
      repository.findProducts = vi.fn().mockResolvedValue([validProduct]);
      repository.findDistributorProcurementRules = vi
        .fn()
        .mockResolvedValue([validProcurementRule]);
      repository.findVehicleAllocationsByPaperId = vi
        .fn()
        .mockResolvedValue([validVehicleAllocation]);
      repository.findDistributorProductRates = vi
        .fn()
        .mockResolvedValue([validDistributorRate]);
      repository.findPurchasePaperByOrderPaperId = vi
        .fn()
        .mockResolvedValue(validPurchasePaper); // ✅ Paper exists
      repository.createPurchasePaper = vi.fn(); // Should NOT be called
      repository.replacePurchaseEntries = vi.fn().mockResolvedValue(undefined);
      repository.findPurchaseEntries = vi.fn().mockResolvedValue([]);

      const dto: SavePurchaseDto = {
        entries: [
          { distributorId: 1, vehicleId: 1, productId: 1, purchasedQty: 50 },
        ],
      };

      await service.savePurchases(1, dto);

      // ✅ VERIFY: Paper NOT created (reused)
      expect(repository.createPurchasePaper).not.toHaveBeenCalled();
    });
  });
});
