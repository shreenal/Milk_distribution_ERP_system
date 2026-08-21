export interface TrayBrand {
  id: number;
  name: string;
}

export interface TrayType {
  id: number;
  color: string;
  description: string | null;
  is_active: boolean;
  brand_id: number;
  master_brand: TrayBrand;
}

export type TrayTypesList = TrayType[];

export interface CreateTrayTypeInput {
  color: string;
  description?: string;
  brand_id: number;
  is_active?: boolean;
}

export interface UpdateTrayTypeInput {
  color?: string;
  description?: string;
  brand_id?: number;
  is_active?: boolean;
}

export interface ProductTrayRule {
  id: number;
  product_group_id: number | null;
  brand_id: number | null;
  product_type_id: number | null;
  packaging_type_id: number | null;
  tray_type_id: number;
  applies_to_packaging: boolean;
  is_active: boolean;
}

export interface CreateTrayRuleRequest {
  product_group_id?: number;
  brand_id?: number;
  product_type_id?: number;
  packaging_type_id?: number;
  tray_type_id: number;
  applies_to_packaging?: boolean;
  is_active?: boolean;
}

export interface UpdateTrayRuleRequest {
  product_group_id?: number;
  brand_id?: number;
  product_type_id?: number;
  packaging_type_id?: number;
  tray_type_id?: number;
  applies_to_packaging?: boolean;
  is_active?: boolean;
}