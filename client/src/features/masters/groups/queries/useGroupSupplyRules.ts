import { useQuery } from "@tanstack/react-query";

import { groupSupplyRulesApi } from "../api/group-supply-rules.api";

export function useGroupSupplyRules() {
  return useQuery({
    queryKey: ["group-supply-rules"],
    queryFn: () => groupSupplyRulesApi.getAll(),
  });
}

export function useActiveGroupSupplyRules() {
  return useQuery({
    queryKey: ["group-supply-rules", "active"],
    queryFn: () => groupSupplyRulesApi.getActive(),
  });
}

export function useGroupSupplyRule(id: number | null) {
  return useQuery({
    queryKey: ["group-supply-rules", id],
    queryFn: () => groupSupplyRulesApi.getById(id!),
    enabled: id !== null,
  });
}