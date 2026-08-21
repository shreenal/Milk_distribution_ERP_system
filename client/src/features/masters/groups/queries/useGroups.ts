import { useQuery } from "@tanstack/react-query";
import { groupsApi } from "../api/groups.api";

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => groupsApi.getAll(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useGroupsActive() {
  return useQuery({
    queryKey: ["groups-active"],
    queryFn: () => groupsApi.getActive(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useGroupById(id: number | null) {
  return useQuery({
    queryKey: ["groups", id],
    queryFn: () => groupsApi.getById(id!),
    enabled: id !== null,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}