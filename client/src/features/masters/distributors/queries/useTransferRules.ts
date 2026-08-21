import { useQuery } from "@tanstack/react-query";

import { transferRulesApi } from "../api/transfer-rules.api";

export function useTransferRules() {
  return useQuery({
    queryKey: ["transfer-rules"],
    queryFn: () => transferRulesApi.getAll(),
  });
}

export function useActiveTransferRules() {
  return useQuery({
    queryKey: ["transfer-rules", "active"],
    queryFn: () => transferRulesApi.getActive(),
  });
}

export function useTransferRule(id: number | null) {
  return useQuery({
    queryKey: ["transfer-rules", id],
    queryFn: () => transferRulesApi.getById(id!),
    enabled: id !== null,
  });
}