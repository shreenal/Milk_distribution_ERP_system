import { useMutation, useQueryClient } from "@tanstack/react-query";

import { driversApi } from "../api/drivers.api";

export function useDeleteDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      driversApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["drivers"],
      });
    },
  });
}