export type DeliverySession = "NIGHT" | "MORNING";

export interface Group {
  id: number;
  name: string;
  is_active: boolean;
  delivery_session: DeliverySession;
  vehicle_id?: number | null;
}

export type GroupsList = Group[];

export interface CreateGroupInput {
  name: string;
  vehicle_id?: number | null;
  delivery_session?: DeliverySession;
  is_active?: boolean;
}

export interface UpdateGroupInput {
  name?: string;
  vehicle_id?: number | null;
  delivery_session?: DeliverySession;
  is_active?: boolean;
}

export type SupplyCategory = "MILK" | "NON_MILK";

export interface GroupSupplyRule {
  id: number;
  group_id: number;
  category: SupplyCategory;
  distributor_id: number;
  is_active: boolean;
}

export interface CreateGroupSupplyRuleInput {
  group_id: number;
  category: SupplyCategory;
  distributor_id: number;
  is_active?: boolean;
}

export interface UpdateGroupSupplyRuleInput {
  group_id?: number;
  category?: SupplyCategory;
  distributor_id?: number;
  is_active?: boolean;
}