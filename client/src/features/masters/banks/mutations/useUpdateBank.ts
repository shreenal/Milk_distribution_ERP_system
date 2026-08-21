import { useMutation, useQueryClient } from "@tanstack/react-query";

import { banksApi } from "../api/banks.api";
import type { UpdateBankRequest } from "../types/banks.types";

export function useUpdateBank() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateBankRequest;
    }) => banksApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["banks"],
      });

      queryClient.invalidateQueries({
        queryKey: ["banks", variables.id],
      });
    },
  });
}