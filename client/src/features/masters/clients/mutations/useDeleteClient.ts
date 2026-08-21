import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clientsApi } from "../api/client.api";

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      clientsApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clients"],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients-active"],
      });
    },
  });
}