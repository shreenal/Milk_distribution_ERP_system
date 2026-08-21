import { useQuery } from "@tanstack/react-query";

import { distributorProductLinksApi } from "../api/distributor-product-links.api";

export function useDistributorProductLinks() {
  return useQuery({
    queryKey: ["distributor-product-links"],
    queryFn: () => distributorProductLinksApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorProductLinksActive() {
  return useQuery({
    queryKey: ["distributor-product-links-active"],
    queryFn: () => distributorProductLinksApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorProductLinkById(
  id: number | null,
) {
  return useQuery({
    queryKey: ["distributor-product-links", id],
    queryFn: () => distributorProductLinksApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}