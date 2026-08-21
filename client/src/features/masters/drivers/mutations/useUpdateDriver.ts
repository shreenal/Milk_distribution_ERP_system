import { useMutation, useQueryClient } from "@tanstack/react-query";

import { driversApi } from "../api/drivers.api";
import type { UpdateDriverRequest } from "../types/drivers.types";

export function useUpdateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDriverRequest;
    }) => driversApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["drivers"],
      });

      queryClient.invalidateQueries({
        queryKey: ["drivers", variables.id],
      });
    },
  });
}