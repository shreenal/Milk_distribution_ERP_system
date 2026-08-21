import { useMutation, useQueryClient } from "@tanstack/react-query";

import { transferRulesApi } from "../api/transfer-rules.api";

export function useDeleteTransferRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      transferRulesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["transfer-rules"],
      });
    },
  });
}