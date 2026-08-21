import { useQuery } from "@tanstack/react-query";

import { driversApi } from "../api/drivers.api";

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: driversApi.getAll,
  });
}

export function useActiveDrivers() {
  return useQuery({
    queryKey: ["drivers", "active"],
    queryFn: driversApi.getActive,
  });
}

export function useDriverById(id: number | null) {
  return useQuery({
    queryKey: ["drivers", id],
    queryFn: () => driversApi.getById(id!),
    enabled: id !== null,
  });
}