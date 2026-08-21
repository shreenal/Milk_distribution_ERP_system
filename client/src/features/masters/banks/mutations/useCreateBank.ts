import { useMutation, useQueryClient } from "@tanstack/react-query";

import { banksApi } from "../api/banks.api";
import type { CreateBankRequest } from "../types/banks.types";

export function useCreateBank() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBankRequest) =>
      banksApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["banks"],
      });
    },
  });
}