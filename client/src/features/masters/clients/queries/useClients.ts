import { useQuery } from "@tanstack/react-query";

import { clientsApi } from "../api/client.api";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => clientsApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useClientsActive() {
  return useQuery({
    queryKey: ["clients-active"],
    queryFn: () => clientsApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useClientById(id: number | null) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: () => clientsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}