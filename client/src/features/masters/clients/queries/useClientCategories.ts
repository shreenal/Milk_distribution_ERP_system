import { useQuery } from "@tanstack/react-query";

import { clientCategoriesApi } from "../api/client-categories.api";

export function useClientCategories() {
  return useQuery({
    queryKey: ["client-categories"],
    queryFn: () => clientCategoriesApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useClientCategoriesByClient(
  clientId: number | null,
) {
  return useQuery({
    queryKey: ["client-categories", "client", clientId],
    queryFn: () =>
      clientCategoriesApi.getByClient(clientId!),
    enabled: clientId !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}