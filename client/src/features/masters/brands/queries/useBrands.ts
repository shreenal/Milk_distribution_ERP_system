import { useQuery } from "@tanstack/react-query";

import { brandsApi } from "../api/brands.api";

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useBrandsActive() {
  return useQuery({
    queryKey: ["brands-active"],
    queryFn: () => brandsApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useBrandById(id: number | null) {
  return useQuery({
    queryKey: ["brands", id],
    queryFn: () => brandsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}