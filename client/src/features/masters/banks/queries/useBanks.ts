import { useQuery } from "@tanstack/react-query";

import { banksApi } from "../api/banks.api";

export function useBanks() {
  return useQuery({
    queryKey: ["banks"],
    queryFn: banksApi.getAll,
  });
}

export function useActiveBanks() {
  return useQuery({
    queryKey: ["banks", "active"],
    queryFn: banksApi.getActive,
  });
}

export function useBankById(id: number | null) {
  return useQuery({
    queryKey: ["banks", id],
    queryFn: () => banksApi.getById(id!),
    enabled: id !== null,
  });
}