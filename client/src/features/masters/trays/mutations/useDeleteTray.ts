import { useMutation, useQueryClient } from "@tanstack/react-query";

import { traysApi } from "../api/trays.api";

export function useDeleteTray() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      traysApi.delete(id),

    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: ["trays"],
      });

      queryClient.invalidateQueries({
        queryKey: ["trays-active"],
      });

      queryClient.removeQueries({
        queryKey: ["trays", id],
      });
    },
  });
}