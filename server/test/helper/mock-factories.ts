// Mock Data Factories
export const mockOrderPaper = (overrides?: any) => ({
  id: 1,
  order_date: new Date('2024-01-15'),
  sale_date: new Date('2024-01-16'),
  status: 'DRAFT',
  night_entry_submitted_at: null,
  morning_entry_submitted_at: null,
  finalized_at: null,
  reopened_at: null,
  reopen_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockVehicleAllocationPaper = (overrides?: any) => ({
  id: 1,
  order_paper_id: 1,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockPurchasePaper = (overrides?: any) => ({
  id: 1,
  order_paper_id: 1,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockVehicle = (overrides?: any) => ({
  id: 1,
  vehicle_number: 'ABC-123',
  vehicle_name: 'Vehicle 1',
  capacity: 1000,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockDistributor = (overrides?: any) => ({
  id: 1,
  name: 'Distributor 1',
  contact: '9876543210',
  email: 'dist1@example.com',
  is_active: true,
  ...overrides,
});

export const mockProduct = (overrides?: any) => ({
  id: 1,
  code: 'PROD-001',
  brand_id: 1,
  product_group_id: 1,
  product_type_id: 1,
  packaging_type_id: 1,
  packaging_size: 1000,
  packaging_unit: 'ml',
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  gst_percentage: 18,
  is_gst_inclusive: false,
  master_brand: {
    id: 1,
    name: 'Brand 1',
    is_active: true,
  },
  master_product_group: {
    id: 1,
    name: 'Group 1',
  },
  master_product_type: {
    id: 1,
    name: 'Type 1',
  },
  master_packaging_type: {
    id: 1,
    name: 'Packaging 1',
  },
  ...overrides,
});

export const mockVehicleAllocation = (overrides?: any) => ({
  id: 1,
  vehicle_allocation_paper_id: 1,
  vehicle_id: 1,
  product_id: 1,
  allocated_qty: 100,
  created_at: new Date(),
  updated_at: new Date(),
  master_vehicle: mockVehicle(),
  master_product: mockProduct(),
  ...overrides,
});

export const mockVehicleAssignment = (overrides?: any) => ({
  id: 1,
  vehicle_allocation_paper_id: 1,
  vehicle_id: 1,
  distributor_id: 1,
  created_at: new Date(),
  updated_at: new Date(),
  master_vehicle: mockVehicle(),
  master_distributor: mockDistributor(),
  ...overrides,
});

export const mockPurchaseEntry = (overrides?: any) => ({
  id: 1,
  purchase_paper_id: 1,
  distributor_id: 1,
  vehicle_id: 1,
  product_id: 1,
  purchased_qty: 100,
  purchase_rate: 100,
  purchase_amount: 10000,
  allocated_qty: 100,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

export const mockDistributorProductRate = (overrides?: any) => ({
  id: 1,
  distributor_id: 1,
  product_id: 1,
  purchase_rate: 100,
  selling_rate: 150,
  effective_from: new Date(),
  effective_to: null,
  is_active: true,
  ...overrides,
});

export const mockDistributorProcurementRule = (overrides?: any) => ({
  id: 1,
  distributor_id: 1,
  brand_id: 1,
  product_group_id: 1,
  is_active: true,
  master_distributor: mockDistributor(),
  master_brand: {
    id: 1,
    name: 'Amul',
  },
  master_product_group: {
    id: 1,
    name: 'Milk',
  },
  ...overrides,
});

export const mockOrderSheet = (overrides?: any) => ({
  id: 1,
  order_paper_id: 1,
  group_id: 1,
  created_at: new Date(),
  updated_at: new Date(),
  master_group: {
    id: 1,
    name: 'Group 1',
    distributor_id: 1,
    vehicle_id: null,
    is_active: true,
  },
  ...overrides,
});

export const mockOrderSheetItem = (overrides?: any) => ({
  id: 1,
  order_sheet_id: 1,
  client_id: 1,
  product_id: 1,
  ordered_qty: 50,
  delivered_qty: 50,
  night_selling_rate: 100,
  final_selling_rate: 100,
  night_bill_amount: 5000,
  final_bill_amount: 5000,
  final_gst_percentage: 18,
  final_gst_amount: 900,
  final_taxable_amount: 5000,
  created_at: new Date(),
  updated_at: new Date(),
  master_product: mockProduct(),
  ...overrides,
});
