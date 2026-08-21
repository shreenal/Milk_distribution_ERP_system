export type SupplyCategory = "MILK" | "NON_MILK";

export interface ProductGroup {
  id: number;
  name: string;
  category: SupplyCategory;
}

export interface CreateProductGroupRequest {
  name: string;
  category: SupplyCategory;
}

export interface UpdateProductGroupRequest
  extends Partial<CreateProductGroupRequest> {}

export type ProductGroupsListResponse = ProductGroup[];