import { useMutation, useQueryClient } from "@tanstack/react-query";

import { transferRulesApi } from "../api/transfer-rules.api";
import type { CreateDistributorTransferRuleInput } from "../types/distributors.types";

export function useCreateTransferRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorTransferRuleInput) =>
      transferRulesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["transfer-rules"],
      });
    },
  });
}