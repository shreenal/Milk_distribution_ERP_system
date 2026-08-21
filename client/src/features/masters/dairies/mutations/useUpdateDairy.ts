import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dairiesApi } from "../api/dairies.api";
import type { UpdateDairyRequest } from "../types/dairies.types";

export function useUpdateDairy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDairyRequest;
    }) => dairiesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dairies"],
      });

      queryClient.invalidateQueries({
        queryKey: ["dairies", variables.id],
      });
    },
  });
}