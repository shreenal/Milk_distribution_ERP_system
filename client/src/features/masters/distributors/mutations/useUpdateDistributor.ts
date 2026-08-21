import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorsApi } from "../api/distributors.api";
import type { UpdateDistributorRequest } from "../types/distributors.types";

export function useUpdateDistributor(id: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateDistributorRequest) => {
      if (id === null) {
        throw new Error("Distributor ID is required");
      }

      return distributorsApi.update(id, data);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["distributors"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributors", id],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributors-active"],
      });
    },
  });
}