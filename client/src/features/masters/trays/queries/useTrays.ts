import { useQuery } from "@tanstack/react-query";

import { traysApi } from "../api/trays.api";

export function useTrays() {
  return useQuery({
    queryKey: ["trays"],
    queryFn: () => traysApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useTraysActive() {
  return useQuery({
    queryKey: ["trays-active"],
    queryFn: () => traysApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useTrayById(id: number | null) {
  return useQuery({
    queryKey: ["trays", id],
    queryFn: () => traysApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}