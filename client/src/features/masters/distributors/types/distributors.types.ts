export interface Distributor {
  id: number;
  name: string;
  contact: string | null;
  email: string | null;
  is_active: boolean;
}

export interface CreateDistributorRequest {
  name: string;
  contact?: string | null;
  email?: string | null;
  is_active?: boolean;
}

export interface UpdateDistributorRequest
  extends Partial<CreateDistributorRequest> {}

export type DistributorsListResponse = Distributor[];

export interface DistributorTransferRule {
  id: number;
  supplier_distributor_id: number;
  owner_distributor_id: number;
  is_active: boolean;
}

export interface CreateDistributorTransferRuleInput {
  supplier_distributor_id: number;
  owner_distributor_id: number;
  is_active?: boolean;
}

export interface UpdateDistributorTransferRuleInput {
  supplier_distributor_id?: number;
  owner_distributor_id?: number;
  is_active?: boolean;
}

export type SupplyCategory = "MILK" | "NON_MILK";

export interface DistributorProcurementRule {
  id: number;
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  category: SupplyCategory;
  is_active: boolean;
  master_distributor?: {
    id: number;
    name: string;
  };
  master_brand?: {
    id: number;
    name: string;
  };
  master_product_group?: {
    id: number;
    name: string;
    category: SupplyCategory;
  };
}

export interface CreateDistributorProcurementRuleRequest {
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  category: SupplyCategory;
  is_active?: boolean;
}

export interface UpdateDistributorProcurementRuleRequest {
  distributor_id?: number;
  brand_id?: number;
  product_group_id?: number;
  category?: SupplyCategory;
  is_active?: boolean;
}

export interface DistributorProductLink {
  id: number;
  distributor_id: number;
  product_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDistributorProductLinkRequest {
  distributor_id: number;
  product_id: number;
  is_active?: boolean;
}

export interface UpdateDistributorProductLinkRequest {
  distributor_id?: number;
  product_id?: number;
  is_active?: boolean;
}


export interface DistributorProductRate {
  id: number;
  product_link_id: number;
  purchase_rate: string;
  selling_rate: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface CreateDistributorProductRateRequest {
  product_link_id: number;
  purchase_rate: number;
  selling_rate: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}

export interface UpdateDistributorProductRateRequest {
  product_link_id?: number;
  purchase_rate?: number;
  selling_rate?: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}