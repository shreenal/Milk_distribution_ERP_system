import type { Brand } from "../../brands/types/brands.types";

export interface ProductType {
  id: number;
  brand_id: number;
  name: string;
  master_brand: Brand;
}

export interface CreateProductTypeRequest {
  brand_id: number;
  name: string;
}

export interface UpdateProductTypeRequest {
  brand_id?: number;
  name?: string;
}

export type ProductTypesListResponse = ProductType[];