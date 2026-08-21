import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorsApi } from "../api/distributors.api";

export function useDeleteDistributor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => distributorsApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["distributors"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributors-active"],
      });
    },
  });
}