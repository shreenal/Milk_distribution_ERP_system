import type { Distributor } from "@/features/masters/distributors/types/distributors.types";

export type SupplyCategory = "MILK" | "NON_MILK";

export interface ClientCategory {
  id: number;
  client_id: number;
  category: SupplyCategory;
  is_active: boolean;
}

export interface ClientGroup {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Client {
  id: number;
  code: string | null;
  name: string;
  contact: string | null;
  shop_name: string | null;
  is_active: boolean;
  delivery_group_id: number;
  owner_distributor_id: number;
  created_at: string;
  updated_at: string;
  delivery_group: ClientGroup;
  owner_distributor: Distributor;
}

export interface CreateClientRequest {
  name: string;
  contact?: string;
  shop_name?: string;
  delivery_group_id: number;
  owner_distributor_id: number;
  is_active?: boolean;
}

export interface UpdateClientRequest {
  name?: string;
  contact?: string;
  shop_name?: string;
  delivery_group_id?: number;
  owner_distributor_id?: number;
  is_active?: boolean;
}

export interface CreateClientCategoryRequest {
  client_id: number;
  category: SupplyCategory;
}

export type ClientsListResponse = Client[];

export interface ClientProductRate {
  id: number;
  client_id: number;
  product_link_id: number;
  selling_rate: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

export interface CreateClientProductRateRequest {
  client_id: number;
  product_link_id: number;
  selling_rate: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}

export interface UpdateClientProductRateRequest {
  client_id?: number;
  product_link_id?: number;
  selling_rate?: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
}