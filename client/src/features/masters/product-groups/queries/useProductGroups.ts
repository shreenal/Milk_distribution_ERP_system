import { useQuery } from "@tanstack/react-query";

import { productGroupsApi } from "../api/product-groups.api";

export function useProductGroups() {
  return useQuery({
    queryKey: ["product-groups"],
    queryFn: () => productGroupsApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useProductGroupById(id: number | null) {
  return useQuery({
    queryKey: ["product-groups", id],
    queryFn: () => productGroupsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}