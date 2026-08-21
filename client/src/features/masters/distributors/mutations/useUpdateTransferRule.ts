import { useMutation, useQueryClient } from "@tanstack/react-query";

import { transferRulesApi } from "../api/transfer-rules.api";
import type { UpdateDistributorTransferRuleInput } from "../types/distributors.types";

export function useUpdateTransferRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDistributorTransferRuleInput;
    }) => transferRulesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["transfer-rules"],
      });

      queryClient.invalidateQueries({
        queryKey: ["transfer-rules", variables.id],
      });
    },
  });
}