export interface VehicleAssignment {
  vehicle_id: number;
  distributor_id: number;

  master_vehicle: {
    id: number;
    vehicle_name: string | null;
  };

  master_distributor: {
    id: number;
    name: string;
  };
}

export interface ProcurementRule {
  distributor_id: number;
  brand_id: number;
  product_group_id: number;
  master_distributor: { name: string };
  master_brand: { name: string };
  master_product_group: { name: string };
}
