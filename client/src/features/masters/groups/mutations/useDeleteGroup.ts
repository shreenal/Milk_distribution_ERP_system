import { useMutation, useQueryClient } from "@tanstack/react-query";
import { groupsApi } from "../api/groups.api";

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      groupsApi.delete(id),

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