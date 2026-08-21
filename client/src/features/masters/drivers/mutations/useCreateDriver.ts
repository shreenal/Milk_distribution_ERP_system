import { useMutation, useQueryClient } from "@tanstack/react-query";

import { driversApi } from "../api/drivers.api";
import type { CreateDriverRequest } from "../types/drivers.types";

export function useCreateDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDriverRequest) =>
      driversApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["drivers"],
      });
    },
  });
}