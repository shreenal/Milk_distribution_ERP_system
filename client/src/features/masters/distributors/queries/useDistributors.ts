import { useQuery } from "@tanstack/react-query";

import { distributorsApi } from "../api/distributors.api";

export function useDistributors() {
  return useQuery({
    queryKey: ["distributors"],
    queryFn: () => distributorsApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorsActive() {
  return useQuery({
    queryKey: ["distributors-active"],
    queryFn: () => distributorsApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useDistributorById(id: number | null) {
  return useQuery({
    queryKey: ["distributors", id],
    queryFn: () => distributorsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}