export type GatepassDatePolicy = "SAME_DAY" | "PREVIOUS_DAY";

export interface BrandDairy {
  id: number;
  name: string;
}

export interface Brand {
  id: number;
  name: string;
  is_active: boolean;
  dairy_id: number;
  gatepass_date_policy: GatepassDatePolicy;
  master_dairy: BrandDairy;
}

export type BrandsList = Brand[];

export interface CreateBrandInput {
  name: string;
  dairy_id: number;
  is_active?: boolean;
  gatepass_date_policy?: GatepassDatePolicy;
}

export interface UpdateBrandInput {
  name?: string;
  dairy_id?: number;
  is_active?: boolean;
  gatepass_date_policy?: GatepassDatePolicy;
}