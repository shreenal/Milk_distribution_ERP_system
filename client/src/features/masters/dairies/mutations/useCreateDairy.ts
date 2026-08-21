import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dairiesApi } from "../api/dairies.api";
import type { CreateDairyRequest } from "../types/dairies.types";

export function useCreateDairy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDairyRequest) =>
      dairiesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dairies"],
      });
    },
  });
}