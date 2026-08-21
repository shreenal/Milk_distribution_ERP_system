import { useQuery } from "@tanstack/react-query";

import { productTypesApi } from "../api/product-types.api";

export function useProductTypes() {
  return useQuery({
    queryKey: ["product-types"],
    queryFn: () => productTypesApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useProductTypeById(id: number | null) {
  return useQuery({
    queryKey: ["product-types", id],
    queryFn: () => productTypesApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}