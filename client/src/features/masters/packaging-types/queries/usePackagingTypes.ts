import { useQuery } from "@tanstack/react-query";

import { packagingTypesApi } from "../api/packaging-types.api";

export function usePackagingTypes() {
  return useQuery({
    queryKey: ["packaging-types"],
    queryFn: () => packagingTypesApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function usePackagingTypeById(id: number | null) {
  return useQuery({
    queryKey: ["packaging-types", id],
    queryFn: () => packagingTypesApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}