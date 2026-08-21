import { useQuery } from "@tanstack/react-query";

import { vehiclesApi } from "../api/vehicles.api";

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: vehiclesApi.getAll,
  });
}

export function useActiveVehicles() {
  return useQuery({
    queryKey: ["vehicles", "active"],
    queryFn: vehiclesApi.getActive,
  });
}

export function useVehicleById(id: number | null) {
  return useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => vehiclesApi.getById(id!),
    enabled: id !== null,
  });
}