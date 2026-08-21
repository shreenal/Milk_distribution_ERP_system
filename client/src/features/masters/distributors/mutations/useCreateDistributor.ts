import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorsApi } from "../api/distributors.api";
import type { CreateDistributorRequest } from "../types/distributors.types";

export function useCreateDistributor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorRequest) =>
      distributorsApi.create(data),

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