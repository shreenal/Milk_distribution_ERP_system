import { useQuery } from "@tanstack/react-query";

import { dairiesApi } from "../api/dairies.api";

export function useDairies() {
  return useQuery({
    queryKey: ["dairies"],
    queryFn: dairiesApi.getAll,
  });
}

export function useActiveDairies() {
  return useQuery({
    queryKey: ["dairies", "active"],
    queryFn: dairiesApi.getActive,
  });
}

export function useDairyById(id: number | null) {
  return useQuery({
    queryKey: ["dairies", id],
    queryFn: () => dairiesApi.getById(id!),
    enabled: id !== null,
  });
}