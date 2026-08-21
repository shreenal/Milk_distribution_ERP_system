import { useMutation, useQueryClient } from "@tanstack/react-query";
import { groupsApi } from "../api/groups.api";
import type { UpdateGroupInput } from "../types/groups.types";

export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateGroupInput;
    }) => groupsApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["groups"],
      });

      queryClient.invalidateQueries({
        queryKey: ["groups-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["groups", variables.id],
      });
    },
  });
}