import { useQuery } from "@tanstack/react-query";

import { ClientProductRatesApi } from "../api/client-product-rates.api";

export function useClientProductRates() {
  return useQuery({
    queryKey: ["client-product-rates"],
    queryFn: () => ClientProductRatesApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useClientProductRatesActive() {
  return useQuery({
    queryKey: ["client-product-rates-active"],
    queryFn: () => ClientProductRatesApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useClientProductRate(id: number | null) {
  return useQuery({
    queryKey: ["client-product-rate", id],
    queryFn: () => ClientProductRatesApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}