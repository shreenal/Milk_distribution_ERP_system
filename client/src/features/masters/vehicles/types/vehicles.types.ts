export interface Vehicle {
  id: number;
  vehicle_number: string;
  vehicle_name: string | null;
  capacity: number | null;
  is_active: boolean;
}

export interface CreateVehicleRequest {
  vehicle_number: string;
  vehicle_name?: string | null;
  capacity?: number;
  is_active?: boolean;
}

export interface UpdateVehicleRequest {
  vehicle_number?: string;
  vehicle_name?: string | null;
  capacity?: number;
  is_active?: boolean;
}

export type VehiclesListResponse = Vehicle[];