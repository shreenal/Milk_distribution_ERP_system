import { useMutation, useQueryClient } from "@tanstack/react-query";
import { groupsApi } from "../api/groups.api";
import type { CreateGroupInput } from "../types/groups.types";

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGroupInput) =>
      groupsApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["groups"],
      });

      queryClient.invalidateQueries({
        queryKey: ["groups-active"],
      });
    },
  });
}