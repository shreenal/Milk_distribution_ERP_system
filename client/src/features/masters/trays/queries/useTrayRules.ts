import { useQuery } from "@tanstack/react-query";

import { TrayRulesApi } from "../api/tray-rules.api";

export function useTrayRules() {
  return useQuery({
    queryKey: ["tray-rules"],
    queryFn: TrayRulesApi.getAll,
  });
}

export function useActiveTrayRules() {
  return useQuery({
    queryKey: ["tray-rules", "active"],
    queryFn: TrayRulesApi.getActive,
  });
}

export function useTrayRule(id: number | null) {
  return useQuery({
    queryKey: ["tray-rules", id],
    queryFn: () => TrayRulesApi.getById(id!),
    enabled: id !== null,
  });
}