import { useQuery } from "@tanstack/react-query";

import { distributorProductRatesApi } from "../api/distributor-product-rates.api";

export function useDistributorProductRates() {
  return useQuery({
    queryKey: ["distributor-product-rates"],
    queryFn: () => distributorProductRatesApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorProductRatesActive() {
  return useQuery({
    queryKey: ["distributor-product-rates-active"],
    queryFn: () => distributorProductRatesApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorProductRateById(
  id: number | null,
) {
  return useQuery({
    queryKey: ["distributor-product-rates", id],
    queryFn: () => distributorProductRatesApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}