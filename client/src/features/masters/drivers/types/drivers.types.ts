export interface Driver {
  id: number;
  name: string;
  contact: string | null;
  vehicle_id: number | null;
  is_active: boolean;
}

export interface CreateDriverRequest {
  name: string;
  contact?: string | null;
  vehicle_id?: number;
  is_active?: boolean;
}

export interface UpdateDriverRequest {
  name?: string;
  contact?: string | null;
  vehicle_id?: number;
  is_active?: boolean;
}

export type DriversListResponse = Driver[];